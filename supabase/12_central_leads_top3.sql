-- Migration 12: Top-3-Händlerwahl und zentraler Lead-Eingang für WordPress.

create extension if not exists pgcrypto;

alter table players add column if not exists dealer_selection_mode text not null default 'automatic'
  check (dealer_selection_mode in ('automatic','user'));
alter table players add column if not exists dealer_rank smallint
  check (dealer_rank between 1 and 3);

create table if not exists lead_integration_clients (
  client_id text primary key,
  token_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists external_leads (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system in ('wordpress')),
  source_form_id text not null,
  source_entry_id text not null,
  source_event text not null,
  lead_date timestamptz not null,
  contact_intent text,
  vehicle_interest text,
  zip text not null check (zip ~ '^[0-9]{5}$'),
  city text not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  consent_stay_in_touch boolean not null default false,
  consent_better_offers boolean not null default false,
  consent_partners boolean not null default false,
  dealer_code text not null references dealers(dealer_code),
  dealer_site_code text,
  dealer_name text not null,
  dealer_address text not null,
  dealer_city text not null,
  dealer_distance_km numeric(8,2) not null,
  dealer_data_version timestamptz not null,
  dealer_selection_mode text not null default 'user' check (dealer_selection_mode in ('automatic','user')),
  dealer_rank smallint not null check (dealer_rank between 1 and 3),
  received_at timestamptz not null default now(),
  unique(source_system,source_form_id,source_entry_id)
);

create index if not exists idx_external_leads_source on external_leads(source_system,source_event,lead_date);

create or replace function public.nearest_dealers_for_zip(p_zip text, p_limit integer default 3)
returns json language plpgsql security definer set search_path=public as $$
declare v_postal postal_codes%rowtype; v_result json;
begin
  if p_zip is null or p_zip !~ '^[0-9]{5}$' then raise exception 'invalid_zip'; end if;
  if p_limit < 1 or p_limit > 3 then raise exception 'invalid_limit'; end if;
  select * into v_postal from postal_codes where zip=p_zip;
  if not found then raise exception 'unknown_zip'; end if;
  select coalesce(json_agg(row_to_json(x) order by x.rank),'[]'::json) into v_result from (
    select d.dealer_code,d.site_code,d.name,d.address,d.city,d.zip,
      round((6371.0088*2*asin(sqrt(
        power(sin(radians(d.latitude-v_postal.latitude)/2),2)+
        cos(radians(v_postal.latitude))*cos(radians(d.latitude))*
        power(sin(radians(d.longitude-v_postal.longitude)/2),2)
      )))::numeric,2) distance_km,
      v_postal.city lead_city,d.imported_at data_version,
      row_number() over(order by
        6371.0088*2*asin(sqrt(
          power(sin(radians(d.latitude-v_postal.latitude)/2),2)+
          cos(radians(v_postal.latitude))*cos(radians(d.latitude))*
          power(sin(radians(d.longitude-v_postal.longitude)/2),2)
        )),d.dealer_code)::smallint rank
    from dealers d where d.active
    order by rank limit p_limit
  ) x;
  return v_result;
end; $$;
grant execute on function public.nearest_dealers_for_zip(text,integer) to anon,authenticated;

create or replace function public.selected_dealer_for_zip(p_zip text,p_dealer_code text)
returns json language plpgsql security definer set search_path=public as $$
declare v_result json;
begin
  select value into v_result
  from json_array_elements(nearest_dealers_for_zip(p_zip,3)) value
  where value->>'dealer_code'=p_dealer_code limit 1;
  if v_result is null then raise exception 'dealer_not_in_nearest_three'; end if;
  return v_result;
end; $$;
revoke all on function public.selected_dealer_for_zip(text,text) from public,anon,authenticated;

create or replace function public.submit_entry_v2(
  p_event_id uuid,p_score integer,p_ghost_overtaken boolean,p_level_reached integer,p_play_duration_s integer,
  p_contact_intent text,p_vehicle_interest text,p_zip text,p_city text,p_first_name text,p_last_name text,p_email text,p_phone text,
  p_consent_stay boolean,p_consent_offers boolean,p_consent_partners boolean,p_terms_accepted boolean,p_terms_version integer,
  p_dealer_code text,p_entry_source text default 'byod'
) returns json language plpgsql security definer set search_path=public as $$
declare v_selected json; v_result json; v_player_id uuid; v_returning boolean;
begin
  v_selected:=selected_dealer_for_zip(p_zip,p_dealer_code);
  v_result:=submit_entry(p_event_id,p_score,p_ghost_overtaken,p_level_reached,p_play_duration_s,
    p_contact_intent,p_vehicle_interest,p_zip,p_city,p_first_name,p_last_name,p_email,p_phone,
    p_consent_stay,p_consent_offers,p_consent_partners,p_terms_accepted,p_terms_version,p_entry_source);
  v_player_id:=(v_result->>'player_id')::uuid; v_returning:=coalesce((v_result->>'is_returning')::boolean,false);
  if not v_returning then
    update players set dealer_code=v_selected->>'dealer_code',dealer_site_code=v_selected->>'site_code',
      dealer_name=v_selected->>'name',dealer_address=v_selected->>'address',dealer_city=v_selected->>'city',
      dealer_distance_km=(v_selected->>'distance_km')::numeric,dealer_data_version=(v_selected->>'data_version')::timestamptz,
      dealer_selection_mode='user',dealer_rank=(v_selected->>'rank')::smallint where id=v_player_id;
	else
	  v_selected:=v_result->'dealer';
  end if;
  return ((v_result::jsonb || jsonb_build_object('dealer',v_selected))::json);
end; $$;
grant execute on function public.submit_entry_v2(uuid,integer,boolean,integer,integer,text,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,integer,text,text) to anon,authenticated;

create or replace function public.submit_external_lead(
  p_client_id text,p_token text,p_source_form_id text,p_source_entry_id text,p_source_event text,p_lead_date timestamptz,
  p_contact_intent text,p_vehicle_interest text,p_zip text,p_first_name text,p_last_name text,p_email text,p_phone text,
  p_consent_stay boolean,p_consent_offers boolean,p_consent_partners boolean,p_dealer_code text
) returns json language plpgsql security definer set search_path=public as $$
declare v_selected json; v_id uuid;
begin
  if not exists(select 1 from lead_integration_clients where client_id=p_client_id and active and token_hash=encode(digest(p_token,'sha256'),'hex'))
    then raise exception 'invalid_integration_client'; end if;
  v_selected:=selected_dealer_for_zip(p_zip,p_dealer_code);
  insert into external_leads(source_system,source_form_id,source_entry_id,source_event,lead_date,contact_intent,vehicle_interest,
    zip,city,first_name,last_name,email,phone,consent_stay_in_touch,consent_better_offers,consent_partners,
    dealer_code,dealer_site_code,dealer_name,dealer_address,dealer_city,dealer_distance_km,dealer_data_version,dealer_selection_mode,dealer_rank)
  values('wordpress',p_source_form_id,p_source_entry_id,p_source_event,coalesce(p_lead_date,now()),p_contact_intent,p_vehicle_interest,
    p_zip,v_selected->>'lead_city',p_first_name,p_last_name,nullif(lower(trim(p_email)),''),p_phone,
    coalesce(p_consent_stay,false),coalesce(p_consent_offers,false),coalesce(p_consent_partners,false),
    v_selected->>'dealer_code',v_selected->>'site_code',v_selected->>'name',v_selected->>'address',v_selected->>'city',
    (v_selected->>'distance_km')::numeric,(v_selected->>'data_version')::timestamptz,'user',(v_selected->>'rank')::smallint)
  on conflict(source_system,source_form_id,source_entry_id) do update set
    contact_intent=excluded.contact_intent,vehicle_interest=excluded.vehicle_interest,zip=excluded.zip,city=excluded.city,
    first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,phone=excluded.phone,
    consent_stay_in_touch=excluded.consent_stay_in_touch,consent_better_offers=excluded.consent_better_offers,
    consent_partners=excluded.consent_partners,dealer_code=excluded.dealer_code,dealer_site_code=excluded.dealer_site_code,
    dealer_name=excluded.dealer_name,dealer_address=excluded.dealer_address,dealer_city=excluded.dealer_city,
    dealer_distance_km=excluded.dealer_distance_km,dealer_data_version=excluded.dealer_data_version,dealer_rank=excluded.dealer_rank,
    received_at=now() returning id into v_id;
  return json_build_object('id',v_id,'dealer',v_selected,'source_system','wordpress');
end; $$;
grant execute on function public.submit_external_lead(text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,boolean,boolean,boolean,text) to anon,authenticated;

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
        w.source_event,''::text
      from external_leads w where p_source in ('all','wordpress')
    ) x),'[]'::json),
    'counts',json_build_object(
      'game',(select count(*) from players where event_id=p_event_id),
      'wordpress',(select count(*) from external_leads)
    )
  ) into v_result from event_export_profiles ep where ep.event_id=p_event_id;
  return v_result;
end; $$;
grant execute on function public.get_central_lead_export(uuid,text,text) to anon,authenticated;

alter table lead_integration_clients enable row level security;
alter table external_leads enable row level security;
revoke all on lead_integration_clients,external_leads from anon,authenticated;
