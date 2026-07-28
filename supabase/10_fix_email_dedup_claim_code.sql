-- Migration 10: same email in one event must reuse the same participant and win code.
-- Fixes case/whitespace variants and concurrent submissions.

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
  v_returning  boolean := false;
  v_email      text;
begin
  if p_terms_accepted is not true then
    raise exception 'terms_not_accepted';
  end if;

  select instant_win_score, instant_win_ghost_req
    into v_win_score, v_win_ghost
    from events where id = p_event_id;
  if v_win_score is null then
    raise exception 'event_not_found';
  end if;

  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || v_email, 0));
    select id into v_player_id
      from players
      where nullif(lower(trim(email)), '') = v_email and event_id = p_event_id
      order by created_at asc
      limit 1;
  end if;

  if v_player_id is not null then
    v_returning := true;
    v_is_win := false;
    select iw.claim_code into v_code
      from instant_wins iw
      join scores s on s.id = iw.score_id
      where iw.event_id = p_event_id and s.player_id = v_player_id
      order by iw.created_at asc
      limit 1;
  else
    v_is_win := p_score >= v_win_score
                and (case when v_win_ghost then p_ghost_overtaken else true end);
    insert into players (
      event_id, contact_intent, vehicle_interest, zip, city,
      first_name, last_name, email, phone,
      consent_stay_in_touch, consent_better_offers, consent_partners,
      terms_accepted, terms_version_at_entry, privacy_accepted_at, entry_source
    ) values (
      p_event_id, p_contact_intent, p_vehicle_interest, p_zip, p_city,
      p_first_name, p_last_name, v_email, p_phone,
      coalesce(p_consent_stay,false), coalesce(p_consent_offers,false), coalesce(p_consent_partners,false),
      true, p_terms_version, now(), coalesce(p_entry_source,'byod')
    ) returning id into v_player_id;
  end if;

  insert into scores (
    event_id, player_id, score, ghost_overtaken, level_reached, play_duration_s, is_instant_win
  ) values (
    p_event_id, v_player_id, p_score, coalesce(p_ghost_overtaken,false),
    coalesce(p_level_reached,1), p_play_duration_s, v_is_win
  ) returning id into v_score_id;

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
    'score_id', v_score_id,
    'is_instant_win', v_is_win,
    'claim_code', v_code,
    'is_returning', v_returning
  );
end;
$$;

grant execute on function public.submit_entry(
  uuid,integer,boolean,integer,integer,text,text,text,text,text,text,text,text,
  boolean,boolean,boolean,boolean,integer,text
) to anon, authenticated;
