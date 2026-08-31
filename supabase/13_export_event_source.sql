-- Migration 13: WordPress-Leads use the selected game event metadata in the
-- central export. Lead origin itself is mapped to COMMUNICATIONCHANNEL by the
-- frontend CSV builder.

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
      from external_leads w cross join events e where e.id=p_event_id and p_source in ('all','wordpress')
    ) x),'[]'::json),
    'counts',json_build_object(
      'game',(select count(*) from players where event_id=p_event_id),
      'wordpress',(select count(*) from external_leads)
    )
  ) into v_result from event_export_profiles ep where ep.event_id=p_event_id;
  return v_result;
end; $$;
grant execute on function public.get_central_lead_export(uuid,text,text) to anon,authenticated;
