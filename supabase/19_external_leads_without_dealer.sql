-- Migration 19: Keep Formidable source records even when no dealer can be assigned.
-- Existing dealer-backed submissions retain their strict validation and snapshots.

begin;

alter table public.external_leads
  alter column zip drop not null,
  alter column city drop not null,
  alter column dealer_code drop not null,
  alter column dealer_name drop not null,
  alter column dealer_address drop not null,
  alter column dealer_city drop not null,
  alter column dealer_distance_km drop not null,
  alter column dealer_data_version drop not null,
  alter column dealer_rank drop not null;

alter table public.external_leads
  drop constraint if exists external_leads_zip_check;
alter table public.external_leads
  add constraint external_leads_zip_check
  check (zip is null or zip ~ '^[0-9]{5}$');

alter table public.external_leads
  drop constraint if exists external_leads_dealer_selection_mode_check;
alter table public.external_leads
  add constraint external_leads_dealer_selection_mode_check
  check (dealer_selection_mode in ('automatic','user','unassigned'));

create or replace function public.submit_external_lead(
  p_client_id text,p_token text,p_source_form_id text,p_source_entry_id text,p_source_event text,p_lead_date timestamptz,
  p_contact_intent text,p_vehicle_interest text,p_zip text,p_first_name text,p_last_name text,p_email text,p_phone text,
  p_consent_stay boolean,p_consent_offers boolean,p_consent_partners boolean,p_dealer_code text,p_event_id uuid
) returns json language plpgsql security definer set search_path=public as $$
declare
  v_selected json;
  v_id uuid;
  v_zip text := nullif(trim(p_zip),'');
  v_city text;
begin
  if not exists(
    select 1 from lead_integration_clients
    where client_id=p_client_id and active
      and token_hash=encode(digest(p_token,'sha256'),'hex')
  ) then
    raise exception 'invalid_integration_client';
  end if;
  if not exists(select 1 from events where id=p_event_id and is_active) then
    raise exception 'invalid_event';
  end if;
  if not (
    (p_source_form_id='7' and p_source_event='leapmotor-tischtennis-gewinnspiel') or
    (p_source_form_id='8' and p_source_event='leapmotor-e4-testival')
  ) then
    raise exception 'invalid_source_mapping';
  end if;
  if v_zip is not null and v_zip !~ '^[0-9]{5}$' then
    raise exception 'invalid_zip';
  end if;

  if v_zip is not null then
    select city into v_city from postal_codes where zip=v_zip;
  end if;

  if v_zip is not null and nullif(trim(p_dealer_code),'') is not null then
    v_selected:=selected_dealer_for_zip(v_zip,p_dealer_code);
  end if;

  insert into external_leads(
    event_id,source_system,source_form_id,source_entry_id,source_event,lead_date,contact_intent,vehicle_interest,
    zip,city,first_name,last_name,email,phone,consent_stay_in_touch,consent_better_offers,consent_partners,
    dealer_code,dealer_site_code,dealer_name,dealer_address,dealer_city,dealer_distance_km,dealer_data_version,
    dealer_selection_mode,dealer_rank
  ) values (
    p_event_id,'wordpress',p_source_form_id,p_source_entry_id,p_source_event,coalesce(p_lead_date,now()),
    p_contact_intent,p_vehicle_interest,v_zip,coalesce(v_selected->>'lead_city',v_city),p_first_name,p_last_name,
    nullif(lower(trim(p_email)),''),p_phone,coalesce(p_consent_stay,false),coalesce(p_consent_offers,false),
    coalesce(p_consent_partners,false),v_selected->>'dealer_code',v_selected->>'site_code',v_selected->>'name',
    v_selected->>'address',v_selected->>'city',(v_selected->>'distance_km')::numeric,
    (v_selected->>'data_version')::timestamptz,
    case when v_selected is null then 'unassigned' else 'user' end,
    (v_selected->>'rank')::smallint
  )
  on conflict(source_system,source_form_id,source_entry_id) do update set
    event_id=excluded.event_id,source_event=excluded.source_event,lead_date=excluded.lead_date,
    contact_intent=excluded.contact_intent,vehicle_interest=excluded.vehicle_interest,
    zip=coalesce(excluded.zip,external_leads.zip),city=coalesce(excluded.city,external_leads.city),
    first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,phone=excluded.phone,
    consent_stay_in_touch=excluded.consent_stay_in_touch,consent_better_offers=excluded.consent_better_offers,
    consent_partners=excluded.consent_partners,
    dealer_code=coalesce(excluded.dealer_code,external_leads.dealer_code),
    dealer_site_code=coalesce(excluded.dealer_site_code,external_leads.dealer_site_code),
    dealer_name=coalesce(excluded.dealer_name,external_leads.dealer_name),
    dealer_address=coalesce(excluded.dealer_address,external_leads.dealer_address),
    dealer_city=coalesce(excluded.dealer_city,external_leads.dealer_city),
    dealer_distance_km=coalesce(excluded.dealer_distance_km,external_leads.dealer_distance_km),
    dealer_data_version=coalesce(excluded.dealer_data_version,external_leads.dealer_data_version),
    dealer_selection_mode=case when excluded.dealer_code is null then external_leads.dealer_selection_mode else excluded.dealer_selection_mode end,
    dealer_rank=coalesce(excluded.dealer_rank,external_leads.dealer_rank),received_at=now()
  returning id into v_id;

  return json_build_object(
    'id',v_id,'event_id',p_event_id,'dealer',v_selected,'source_system','wordpress',
    'dealer_assignment',case when v_selected is null then 'unassigned' else 'assigned' end
  );
end; $$;

grant execute on function public.submit_external_lead(text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,boolean,boolean,boolean,text,uuid)
  to anon,authenticated;

commit;
