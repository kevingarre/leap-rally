-- ═══════════════════════════════════════════════════════════
-- LEAP CHARGE — Event-Verwaltung
-- Verwendung: Supabase Dashboard → SQL Editor → ausführen
-- ═══════════════════════════════════════════════════════════

-- ── SCHRITT 1: Aktuelles Event archivieren ─────────────────
-- Sichert alle Spieler, Scores und Instant-Wins als JSON-Snapshot
-- Danach werden alle Daten des alten Events gelöscht (CASCADE)

DO $$
DECLARE
  v_event_id   uuid;
  v_event_name text;
  v_snapshot   jsonb;
  v_players    int;
  v_scores     int;
BEGIN
  -- Aktuell aktives Event ermitteln
  SELECT id, name INTO v_event_id, v_event_name
  FROM events WHERE is_active = true LIMIT 1;

  IF v_event_id IS NULL THEN
    RAISE NOTICE 'Kein aktives Event gefunden — nichts zu archivieren.';
    RETURN;
  END IF;

  -- Vollständigen Snapshot bauen
  SELECT jsonb_build_object(
    'event',    row_to_json(e.*),
    'players',  (SELECT jsonb_agg(row_to_json(p.*)) FROM players p WHERE p.event_id = v_event_id),
    'scores',   (SELECT jsonb_agg(row_to_json(s.*)) FROM scores  s WHERE s.event_id = v_event_id),
    'wins',     (SELECT jsonb_agg(row_to_json(w.*)) FROM instant_wins w WHERE w.event_id = v_event_id)
  ) INTO v_snapshot
  FROM events e WHERE e.id = v_event_id;

  SELECT count(*) INTO v_players FROM players WHERE event_id = v_event_id;
  SELECT count(*) INTO v_scores  FROM scores  WHERE event_id = v_event_id;

  -- Archiv-Eintrag anlegen
  INSERT INTO archived_events (event_id, event_name, player_count, score_count, snapshot_json)
  VALUES (v_event_id, v_event_name, v_players, v_scores, v_snapshot);

  -- Event deaktivieren (Daten bleiben via CASCADE-Referenz im Archiv)
  UPDATE events SET is_active = false WHERE id = v_event_id;

  RAISE NOTICE 'Event "%" archiviert: % Spieler, % Scores.', v_event_name, v_players, v_scores;
END $$;


-- ── SCHRITT 2: Neues Event anlegen ─────────────────────────
-- Passe Name, Location und Datum an!

INSERT INTO events (
  name,
  location,
  starts_at,
  ends_at,
  is_active,
  instant_win_score,
  instant_win_ghost_req
) VALUES (
  'Leapmotor Event — [DATUM/ORT hier eintragen]',   -- ← Name anpassen
  '[Location hier eintragen]',                       -- ← Ort anpassen
  now(),                                             -- ← Startzeit (oder manuell: '2026-07-20 10:00:00+02')
  now() + interval '2 days',                        -- ← Endzeit anpassen
  true,                                              -- sofort aktiv
  1500,                                              -- Punkte-Schwelle für Sofort-Gewinn
  true                                               -- Ghost-Überholen Pflicht
);


-- ── ERGEBNIS PRÜFEN ────────────────────────────────────────
SELECT id, name, location, is_active, instant_win_score, created_at
FROM events ORDER BY created_at DESC LIMIT 5;
