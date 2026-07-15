-- ═══════════════════════════════════════════════════════════
-- LEAP RALLY — Fehlende Staff-RPCs (nachgezogen 2026-07-15)
-- ═══════════════════════════════════════════════════════════

-- ── get_all_events_staff ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_events_staff(p_staff_pin text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_staff_pin <> '2882' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN (
    SELECT json_agg(row_to_json(r) ORDER BY r.created_at DESC)
    FROM (
      SELECT e.id, e.name, e.location, e.is_active,
        e.starts_at, e.ends_at, e.instant_win_score,
        e.instant_win_ghost_req, e.difficulty, e.created_at,
        (SELECT COUNT(*)::integer FROM players p WHERE p.event_id = e.id) AS player_count,
        (SELECT COUNT(*)::integer FROM scores  s WHERE s.event_id = e.id) AS score_count
      FROM events e
    ) r
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_all_events_staff(text) TO anon;

-- ── update_event_details ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_event_details(
  p_event_id uuid, p_name text, p_location text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_staff_pin text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_staff_pin <> '2882' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE events SET
    name = COALESCE(p_name, name), location = COALESCE(p_location, location),
    starts_at = p_starts_at, ends_at = p_ends_at
  WHERE id = p_event_id;
  RETURN json_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.update_event_details(uuid,text,text,timestamptz,timestamptz,text) TO anon;
