-- Migration 17: bind WordPress leads to a concrete event.
-- Plugin 2.0.4 stays compatible because event_id remains nullable; plugin
-- 2.1.0 selects the overloaded RPC by sending p_event_id.

alter table public.external_leads
  add column if not exists event_id uuid references public.events(id) on delete restrict;

update public.external_leads
set event_id = 'b7be91e4-f2d4-4134-ab39-d025f5f93843'::uuid
where event_id is null;

create index if not exists idx_external_leads_event
  on public.external_leads(event_id, lead_date);

create or replace function public.submit_external_lead(
  p_client_id text,p_token text,p_source_form_id text,p_source_entry_id text,p_source_event text,p_lead_date timestamptz,
  p_contact_intent text,p_vehicle_interest text,p_zip text,p_first_name text,p_last_name text,p_email text,p_phone text,
  p_consent_stay boolean,p_consent_offers boolean,p_consent_partners boolean,p_dealer_code text,p_event_id uuid
) returns json language plpgsql security definer set search_path=public as $$
declare v_selected json; v_id uuid;
begin
  if not exists(select 1 from lead_integration_clients where client_id=p_client_id and active and token_hash=encode(digest(p_token,'sha256'),'hex'))
    then raise exception 'invalid_integration_client'; end if;
  if not exists(select 1 from events where id=p_event_id and is_active)
    then raise exception 'invalid_event'; end if;
  v_selected:=selected_dealer_for_zip(p_zip,p_dealer_code);
  insert into external_leads(event_id,source_system,source_form_id,source_entry_id,source_event,lead_date,contact_intent,vehicle_interest,
    zip,city,first_name,last_name,email,phone,consent_stay_in_touch,consent_better_offers,consent_partners,
    dealer_code,dealer_site_code,dealer_name,dealer_address,dealer_city,dealer_distance_km,dealer_data_version,dealer_selection_mode,dealer_rank)
  values(p_event_id,'wordpress',p_source_form_id,p_source_entry_id,p_source_event,coalesce(p_lead_date,now()),p_contact_intent,p_vehicle_interest,
    p_zip,v_selected->>'lead_city',p_first_name,p_last_name,nullif(lower(trim(p_email)),''),p_phone,
    coalesce(p_consent_stay,false),coalesce(p_consent_offers,false),coalesce(p_consent_partners,false),
    v_selected->>'dealer_code',v_selected->>'site_code',v_selected->>'name',v_selected->>'address',v_selected->>'city',
    (v_selected->>'distance_km')::numeric,(v_selected->>'data_version')::timestamptz,'user',(v_selected->>'rank')::smallint)
  on conflict(source_system,source_form_id,source_entry_id) do update set
    event_id=excluded.event_id,source_event=excluded.source_event,contact_intent=excluded.contact_intent,vehicle_interest=excluded.vehicle_interest,
    zip=excluded.zip,city=excluded.city,first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,phone=excluded.phone,
    consent_stay_in_touch=excluded.consent_stay_in_touch,consent_better_offers=excluded.consent_better_offers,
    consent_partners=excluded.consent_partners,dealer_code=excluded.dealer_code,dealer_site_code=excluded.dealer_site_code,
    dealer_name=excluded.dealer_name,dealer_address=excluded.dealer_address,dealer_city=excluded.dealer_city,
    dealer_distance_km=excluded.dealer_distance_km,dealer_data_version=excluded.dealer_data_version,dealer_rank=excluded.dealer_rank,
    received_at=now() returning id into v_id;
  return json_build_object('id',v_id,'event_id',p_event_id,'dealer',v_selected,'source_system','wordpress');
end; $$;

grant execute on function public.submit_external_lead(text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,boolean,boolean,boolean,text,uuid) to anon,authenticated;

create or replace function public.get_central_lead_export(p_event_id uuid,p_source text,p_staff_pin text)
returns json language plpgsql security definer set search_path=public as $$
declare v_result json;
begin
  if p_staff_pin <> '2882' then raise exception 'invalid_pin'; end if;
  if p_source not in ('all','game','wordpress') then raise exception 'invalid_source'; end if;
  insert into event_export_profiles(event_id) values(p_event_id) on conflict do nothing;
  select json_build_object(
    'profile',row_to_json(ep),
    'rows',coalesce((select json_agg(row_to_json(x) order by x.lead_date) from (
      select 'game'::text source_system,p.id::text source_entry_id,p.created_at lead_date,p.first_name,p.last_name,p.zip,p.city,p.email,p.phone,
        p.contact_intent,p.vehicle_interest,p.consent_stay_in_touch,p.consent_better_offers,p.consent_partners,p.terms_version_at_entry,
        p.dealer_code,p.dealer_site_code,p.dealer_name,p.dealer_address,p.dealer_city,p.dealer_distance_km,p.dealer_selection_mode,p.dealer_rank,
        e.name event_name,e.location event_location
      from players p join events e on e.id=p.event_id where p.event_id=p_event_id and p_source in ('all','game')
      union all
      select 'wordpress',w.source_entry_id,w.lead_date,w.first_name,w.last_name,w.zip,w.city,w.email,w.phone,
        w.contact_intent,w.vehicle_interest,w.consent_stay_in_touch,w.consent_better_offers,w.consent_partners,null::integer,
        w.dealer_code,w.dealer_site_code,w.dealer_name,w.dealer_address,w.dealer_city,w.dealer_distance_km,w.dealer_selection_mode,w.dealer_rank,
        e.name,e.location
      from external_leads w join events e on e.id=w.event_id where w.event_id=p_event_id and p_source in ('all','wordpress')
    ) x),'[]'::json),
    'counts',json_build_object(
      'game',(select count(*) from players where event_id=p_event_id),
      'wordpress',(select count(*) from external_leads where event_id=p_event_id)
    )
  ) into v_result from event_export_profiles ep where ep.event_id=p_event_id;
  return v_result;
end; $$;

grant execute on function public.get_central_lead_export(uuid,text,text) to anon,authenticated;

create or replace function public.get_wordpress_analytics(p_event_id uuid,p_staff_pin text)
returns json language plpgsql security definer set search_path=public as $$
declare v_total integer; v_pfahrt integer; v_angebot integer; v_kein integer; v_top_v text; v_top_vc integer; v_consent_mkt integer; v_by_dealer json;
begin
  if p_staff_pin <> '2882' then raise exception 'unauthorized'; end if;
  select count(*)::integer into v_total from external_leads where event_id=p_event_id;
  select count(*) filter (where contact_intent='probefahrt')::integer,
    count(*) filter (where contact_intent='angebot')::integer,
    count(*) filter (where contact_intent is null or contact_intent='' or contact_intent='nein')::integer,
    count(*) filter (where consent_stay_in_touch=true)::integer
  into v_pfahrt,v_angebot,v_kein,v_consent_mkt from external_leads where event_id=p_event_id;
  select vehicle_interest,count(*)::integer into v_top_v,v_top_vc from external_leads
    where event_id=p_event_id and vehicle_interest is not null and vehicle_interest<>'' group by vehicle_interest order by count(*) desc limit 1;
  select json_agg(row_to_json(x)) into v_by_dealer from (
    select dealer_name,dealer_city,count(*)::integer lead_count from external_leads where event_id=p_event_id
    group by dealer_name,dealer_city order by count(*) desc limit 5
  ) x;
  return json_build_object('total',coalesce(v_total,0),'probefahrt',coalesce(v_pfahrt,0),'angebot',coalesce(v_angebot,0),
    'kein_kontakt',coalesce(v_kein,0),'consent_marketing',coalesce(v_consent_mkt,0),'top_vehicle',v_top_v,
    'top_vehicle_count',coalesce(v_top_vc,0),'top_dealers',coalesce(v_by_dealer,'[]'::json));
end; $$;

grant execute on function public.get_wordpress_analytics(uuid,text) to anon;

create or replace function public.get_total_analytics(p_event_id uuid,p_staff_pin text)
returns json language plpgsql security definer set search_path=public as $$
declare v_game_players integer; v_game_pfahrt integer; v_game_angebot integer; v_wp_total integer; v_wp_pfahrt integer;
  v_wp_angebot integer; v_consent_mkt integer; v_top_v text; v_top_vc integer; v_by_dealer json;
begin
  if p_staff_pin <> '2882' then raise exception 'unauthorized'; end if;
  select count(*)::integer,count(*) filter(where contact_intent='probefahrt')::integer,count(*) filter(where contact_intent='angebot')::integer
    into v_game_players,v_game_pfahrt,v_game_angebot from players where event_id=p_event_id;
  select count(*)::integer,count(*) filter(where contact_intent ilike '%probefahrt%')::integer,
    count(*) filter(where contact_intent ilike '%angebot%')::integer,count(*) filter(where consent_stay_in_touch=true)::integer
    into v_wp_total,v_wp_pfahrt,v_wp_angebot,v_consent_mkt from external_leads where event_id=p_event_id;
  select vehicle_interest,count(*)::integer into v_top_v,v_top_vc from (
    select vehicle_interest from players where event_id=p_event_id and vehicle_interest is not null
    union all select vehicle_interest from external_leads where event_id=p_event_id and vehicle_interest is not null and vehicle_interest<>''
  ) combined group by vehicle_interest order by count(*) desc limit 1;
  select json_agg(row_to_json(x)) into v_by_dealer from (
    select dealer_name,dealer_city,count(*)::integer lead_count from (
      select dealer_name,dealer_city from players where event_id=p_event_id and dealer_name is not null and dealer_name<>''
      union all select dealer_name,dealer_city from external_leads where event_id=p_event_id and dealer_name is not null and dealer_name<>''
    ) combined group by dealer_name,dealer_city order by count(*) desc limit 5
  ) x;
  return json_build_object('game_players',coalesce(v_game_players,0),'game_probefahrt',coalesce(v_game_pfahrt,0),
    'game_angebot',coalesce(v_game_angebot,0),'wp_total',coalesce(v_wp_total,0),'wp_probefahrt',coalesce(v_wp_pfahrt,0),
    'wp_angebot',coalesce(v_wp_angebot,0),'consent_marketing',coalesce(v_consent_mkt,0),'top_vehicle',v_top_v,
    'top_vehicle_count',coalesce(v_top_vc,0),'top_dealers',coalesce(v_by_dealer,'[]'::json));
end; $$;

grant execute on function public.get_total_analytics(uuid,text) to anon;
