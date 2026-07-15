-- ═══════════════════════════════════════════════════════════
-- LEAP CHARGE — Staff-RPCs (SECURITY DEFINER)
-- Ausführen: Supabase Dashboard → SQL Editor → ausführen
--
-- SECURITY DEFINER: Funktionen laufen als postgres-User →
--   umgehen RLS und dürfen events / archived_events schreiben.
--   Grant to anon → aufrufbar per anon key vom Staff-Panel.
--
-- PIN ÄNDERN:
--   In allen 4 Funktionen den String '2882' durch neuen PIN ersetzen.
--   Suche nach:  IF p_staff_pin <> '2882' THEN
-- ═══════════════════════════════════════════════════════════


-- ── 1. archive_and_new_event ─────────────────────────────────
-- Archiviert aktuelles Event (Snapshot + deaktivieren) und
-- legt sofort ein neues aktives Event an.
-- Gibt { new_event_id, archive_id, old_player_count, old_score_count } zurück.
CREATE OR REPLACE FUNCTION public.archive_and_new_event(
  p_name              text,
  p_location          text,
  p_starts_at         timestamptz,
  p_ends_at           timestamptz,
  p_instant_win_score integer,
  p_ghost_req         boolean,
  p_staff_pin         text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_id     uuid;
  v_old_name   text;
  v_snapshot   jsonb;
  v_players    integer := 0;
  v_scores     integer := 0;
  v_archive_id uuid;
  v_new_id     uuid;
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  -- ── Altes aktives Event ermitteln ───────────────────────────
  SELECT id, name
    INTO v_old_id, v_old_name
    FROM events
   WHERE is_active = true
   LIMIT 1;

  -- ── Archivieren wenn vorhanden ──────────────────────────────
  IF v_old_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'event',   row_to_json(e.*),
      'players', (SELECT jsonb_agg(row_to_json(p.*)) FROM players p WHERE p.event_id = v_old_id),
      'scores',  (SELECT jsonb_agg(row_to_json(s.*)) FROM scores  s WHERE s.event_id = v_old_id),
      'wins',    (SELECT jsonb_agg(row_to_json(w.*)) FROM instant_wins w WHERE w.event_id = v_old_id)
    )
    INTO v_snapshot
    FROM events e
   WHERE e.id = v_old_id;

    SELECT count(*) INTO v_players FROM players     WHERE event_id = v_old_id;
    SELECT count(*) INTO v_scores  FROM scores      WHERE event_id = v_old_id;

    INSERT INTO archived_events (event_id, event_name, player_count, score_count, snapshot_json)
    VALUES (v_old_id, v_old_name, v_players, v_scores, coalesce(v_snapshot, '{}'::jsonb))
    RETURNING id INTO v_archive_id;

    UPDATE events SET is_active = false WHERE id = v_old_id;

    RAISE NOTICE 'Event "%" archiviert: % Spieler, % Scores.', v_old_name, v_players, v_scores;
  END IF;

  -- ── Neues Event anlegen ─────────────────────────────────────
  INSERT INTO events (
    name,
    location,
    starts_at,
    ends_at,
    is_active,
    instant_win_score,
    instant_win_ghost_req
  ) VALUES (
    trim(p_name),
    p_location,
    p_starts_at,
    p_ends_at,
    true,
    coalesce(p_instant_win_score, 1500),
    coalesce(p_ghost_req, true)
  )
  RETURNING id INTO v_new_id;

  RETURN json_build_object(
    'new_event_id',     v_new_id,
    'archive_id',       v_archive_id,
    'old_player_count', v_players,
    'old_score_count',  v_scores
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_and_new_event(
  text, text, timestamptz, timestamptz, integer, boolean, text
) TO anon, authenticated;


-- ── 2. update_event_difficulty ───────────────────────────────
-- Setzt difficulty ('easy'|'normal'|'hard') des aktiven Events.
-- Gibt true zurück bei Erfolg.
CREATE OR REPLACE FUNCTION public.update_event_difficulty(
  p_event_id   uuid,
  p_difficulty text,
  p_staff_pin  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  IF p_difficulty NOT IN ('easy', 'normal', 'hard') THEN
    RAISE EXCEPTION 'invalid_difficulty: must be easy|normal|hard';
  END IF;

  UPDATE events
     SET difficulty = p_difficulty
   WHERE id = p_event_id
     AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found_or_inactive';
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_event_difficulty(uuid, text, text)
  TO anon, authenticated;


-- ── 3. claim_instant_win ─────────────────────────────────────
-- Markiert einen Gewinn-Code als eingelöst (Staff-Verifikation vor Ort).
-- Setzt claimed_at=now(), claimed_by_staff='staff'.
-- Gibt true zurück wenn erfolgreich, false wenn Code nicht gefunden / bereits eingelöst.
CREATE OR REPLACE FUNCTION public.claim_instant_win(
  p_code      text,
  p_event_id  uuid,
  p_staff_pin text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_id uuid;
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  -- Nur offene (noch nicht eingelöste) Codes matchen
  SELECT id
    INTO v_row_id
    FROM instant_wins
   WHERE claim_code  = p_code
     AND event_id    = p_event_id
     AND claimed_at IS NULL;

  IF v_row_id IS NULL THEN
    -- Nicht gefunden oder bereits eingelöst
    RETURN false;
  END IF;

  UPDATE instant_wins
     SET claimed_at       = now(),
         claimed_by_staff = 'staff'
   WHERE id = v_row_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_instant_win(text, uuid, text)
  TO anon, authenticated;


-- ── 4. get_staff_wins ────────────────────────────────────────
-- Gibt alle Instant-Win-Codes eines Events inkl. Spieler-Name + Score zurück.
-- HINWEIS: Bonus-RPC, nötig weil anon kein SELECT auf players hat (DSGVO-RLS).
--   SECURITY DEFINER erlaubt den players-JOIN ohne RLS-Konflikt.
CREATE OR REPLACE FUNCTION public.get_staff_wins(
  p_event_id  uuid,
  p_staff_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT
        iw.id,
        iw.claim_code,
        iw.created_at,
        iw.claimed_at,
        iw.claimed_by_staff,
        s.score,
        p.first_name,
        p.last_name
      FROM instant_wins iw
      JOIN scores  s ON s.id = iw.score_id
      LEFT JOIN players p ON p.id = s.player_id
      WHERE iw.event_id = p_event_id
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_wins(uuid, text)
  TO anon, authenticated;


-- ── 5. record_fallback_win ───────────────────────────────────
-- Schreibt einen frontend-generierten Fallback-Code in die DB.
-- Wird aufgerufen wenn is_instant_win=false vom Server zurückkam, aber
-- das Frontend einen Instant-Win getriggert und einen lokalen Code generiert hat.
-- Verhindert "Zombie-Codes" die Staff nicht verifizieren kann.
--
-- Gibt true zurück wenn erfolgreich eingetragen,
-- false wenn der Code für dieses Event bereits existiert (Duplikat).
CREATE OR REPLACE FUNCTION public.record_fallback_win(
  p_event_id   uuid,
  p_player_id  uuid,
  p_score_id   uuid,
  p_claim_code text,
  p_staff_pin  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  -- ── Duplikat-Schutz ─────────────────────────────────────────
  SELECT EXISTS(
    SELECT 1 FROM instant_wins
     WHERE claim_code = p_claim_code
       AND event_id   = p_event_id
  ) INTO v_exists;

  IF v_exists THEN
    RETURN false;  -- Code für dieses Event bereits vorhanden
  END IF;

  -- ── Fallback-Gewinn eintragen ───────────────────────────────
  INSERT INTO instant_wins (event_id, score_id, claim_code)
  VALUES (p_event_id, p_score_id, p_claim_code);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_fallback_win(uuid, uuid, uuid, text, text)
  TO anon, authenticated;


-- ── 5. get_event_export (Sprint B — CSV Export RLS-Fix) ──────
-- Umgeht RLS auf der players-Tabelle: anon darf normalerweise kein SELECT.
-- SECURITY DEFINER läuft als postgres → kann alles lesen.
-- Gibt JSON-Array zurück: alle Spieler + bester Score + Gewinn-Code.
-- Felder sind identisch mit dem Client-seitigen CSV-Export (staff.js).
CREATE OR REPLACE FUNCTION public.get_event_export(
  p_event_id  uuid,
  p_staff_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  -- ── Export-Query ────────────────────────────────────────────
  -- Für jeden Spieler: Kontaktdaten, bester Score, Sofort-Gewinn-Code
  SELECT json_agg(row_to_json(export_row))
  INTO   v_result
  FROM (
    SELECT
      p.id                  AS player_id,
      p.first_name,
      p.last_name,
      p.email,
      p.phone,
      p.zip,
      p.city,
      p.contact_intent,
      p.vehicle_interest,
      p.consent_stay        AS consent_stay_in_touch,
      p.consent_offers      AS consent_better_offers,
      p.consent_partners,
      p.terms_accepted,
      p.created_at          AS entry_timestamp,
      p.entry_source,
      -- Bester Score dieses Spielers für dieses Event
      bs.score              AS best_score,
      bs.level_reached,
      bs.ghost_overtaken,
      bs.play_duration_s,
      -- Sofort-Gewinn
      iw.claim_code         AS instant_win_code,
      iw.claimed_at         AS instant_win_claimed_at,
      iw.claimed_by_staff   AS instant_win_claimed_by,
      CASE WHEN iw.claimed_at IS NOT NULL THEN true ELSE false END AS instant_win_redeemed
    FROM players p
    -- Bester Score per Spieler (höchster score)
    LEFT JOIN LATERAL (
      SELECT score, level_reached, ghost_overtaken, play_duration_s
      FROM scores s
      WHERE s.player_id = p.id
        AND s.event_id  = p_event_id
      ORDER BY s.score DESC
      LIMIT 1
    ) bs ON true
    -- Sofort-Gewinn (falls vorhanden, via scores.id)
    LEFT JOIN LATERAL (
      SELECT iw2.claim_code, iw2.claimed_at, iw2.claimed_by_staff
      FROM instant_wins iw2
      JOIN scores sc ON sc.id = iw2.score_id
      WHERE sc.player_id = p.id
        AND iw2.event_id = p_event_id
      ORDER BY iw2.created_at ASC
      LIMIT 1
    ) iw ON true
    WHERE p.event_id = p_event_id
    ORDER BY p.created_at ASC
  ) export_row;

  -- Gib leeres Array zurück wenn keine Spieler
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_export(uuid, text)
  TO anon, authenticated;
