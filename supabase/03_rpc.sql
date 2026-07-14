-- ═══════════════════════════════════════════════════════════
-- LEAP CHARGE — RPC-Funktionen (SECURITY DEFINER)
-- Grund: PostgREST-Direktinsert auf players war trotz korrekter
-- RLS-Policy nicht zuverlässig (Cache-Eigenart). RPC ist robust,
-- atomar und einfacher fürs Frontend (1 Call statt 3).
-- ═══════════════════════════════════════════════════════════

-- Legt Player + Score (+ optional Instant-Win) in EINER Transaktion an.
-- Gibt player_id, score_id und ggf. claim_code zurück.
create or replace function public.submit_entry(
  p_event_id            uuid,
  p_score               integer,
  p_ghost_overtaken     boolean,
  p_level_reached       integer,
  p_play_duration_s     integer,
  p_contact_intent      text,
  p_vehicle_interest    text,
  p_zip                 text,
  p_city                text,
  p_first_name          text,
  p_last_name           text,
  p_email               text,
  p_phone               text,
  p_consent_stay        boolean,
  p_consent_offers      boolean,
  p_consent_partners    boolean,
  p_terms_accepted      boolean,
  p_terms_version       integer,
  p_entry_source        text default 'byod'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id  uuid;
  v_score_id   uuid;
  v_win_score  integer;
  v_win_ghost  boolean;
  v_is_win     boolean := false;
  v_code       text := null;
  v_try        integer := 0;
begin
  -- Terms sind Pflicht
  if p_terms_accepted is not true then
    raise exception 'terms_not_accepted';
  end if;

  -- Event-Konfiguration lesen
  select instant_win_score, instant_win_ghost_req
    into v_win_score, v_win_ghost
    from events where id = p_event_id;

  if v_win_score is null then
    raise exception 'event_not_found';
  end if;

  -- Sofort-Gewinn bestimmen (serverseitig, nicht manipulierbar)
  v_is_win := p_score >= v_win_score
              and (case when v_win_ghost then p_ghost_overtaken else true end);

  -- Player anlegen
  insert into players (
    event_id, contact_intent, vehicle_interest, zip, city,
    first_name, last_name, email, phone,
    consent_stay_in_touch, consent_better_offers, consent_partners,
    terms_accepted, terms_version_at_entry, privacy_accepted_at, entry_source
  ) values (
    p_event_id, p_contact_intent, p_vehicle_interest, p_zip, p_city,
    p_first_name, p_last_name, p_email, p_phone,
    coalesce(p_consent_stay,false), coalesce(p_consent_offers,false), coalesce(p_consent_partners,false),
    true, p_terms_version, now(), coalesce(p_entry_source,'byod')
  ) returning id into v_player_id;

  -- Score anlegen
  insert into scores (
    event_id, player_id, score, ghost_overtaken, level_reached, play_duration_s, is_instant_win
  ) values (
    p_event_id, v_player_id, p_score, coalesce(p_ghost_overtaken,false),
    coalesce(p_level_reached,1), p_play_duration_s, v_is_win
  ) returning id into v_score_id;

  -- Instant-Win mit eindeutigem 4-stelligen Code (Retry bei Kollision)
  if v_is_win then
    loop
      v_try := v_try + 1;
      v_code := lpad((floor(random()*10000))::int::text, 4, '0');
      begin
        insert into instant_wins (event_id, score_id, claim_code)
        values (p_event_id, v_score_id, v_code);
        exit;
      exception when unique_violation then
        if v_try >= 20 then raise exception 'code_generation_failed'; end if;
      end;
    end loop;
  end if;

  return json_build_object(
    'player_id', v_player_id,
    'score_id',  v_score_id,
    'is_instant_win', v_is_win,
    'claim_code', v_code
  );
end;
$$;

grant execute on function public.submit_entry(
  uuid,integer,boolean,integer,integer,text,text,text,text,text,text,text,text,
  boolean,boolean,boolean,boolean,integer,text
) to anon, authenticated;

-- Anonymen Score (ohne Formular) sichern — falls Spieler nicht einträgt.
-- Optional genutzt; für "Score zuerst"-Variante.
create or replace function public.submit_anon_score(
  p_event_id uuid, p_score integer, p_ghost boolean, p_level integer, p_duration integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into scores (event_id, score, ghost_overtaken, level_reached, play_duration_s)
  values (p_event_id, p_score, coalesce(p_ghost,false), coalesce(p_level,1), p_duration)
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.submit_anon_score(uuid,integer,boolean,integer,integer) to anon, authenticated;
