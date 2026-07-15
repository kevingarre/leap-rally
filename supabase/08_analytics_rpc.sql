-- ═══════════════════════════════════════════════════════════
-- LEAP RALLY — Analytics RPC
-- Gibt Event-Statistiken für das Staff-Panel zurück.
-- PIN-gesichert via SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_event_analytics(
  p_event_id  uuid,
  p_staff_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total      integer;
  v_avg_score  integer;
  v_avg_dur    integer;
  v_pcount     integer;
  v_conv       integer;
  v_pfahrt     integer;
  v_angebot    integer;
  v_kein       integer;
  v_top_v      text;
  v_top_vc     integer;
BEGIN
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT
    COUNT(*)::integer,
    COALESCE(ROUND(AVG(score))::integer, 0),
    COALESCE(ROUND(AVG(play_duration_s))::integer, 0)
  INTO v_total, v_avg_score, v_avg_dur
  FROM scores WHERE event_id = p_event_id;

  SELECT COUNT(*)::integer INTO v_pcount
  FROM players WHERE event_id = p_event_id;

  SELECT
    COUNT(*) FILTER (WHERE contact_intent = 'probefahrt')::integer,
    COUNT(*) FILTER (WHERE contact_intent = 'angebot')::integer,
    COUNT(*) FILTER (WHERE contact_intent = 'nein')::integer
  INTO v_pfahrt, v_angebot, v_kein
  FROM players WHERE event_id = p_event_id;

  v_conv := COALESCE(v_pfahrt, 0) + COALESCE(v_angebot, 0);

  SELECT vehicle_interest, COUNT(*)::integer
  INTO v_top_v, v_top_vc
  FROM players
  WHERE event_id = p_event_id AND vehicle_interest IS NOT NULL
  GROUP BY vehicle_interest ORDER BY COUNT(*) DESC LIMIT 1;

  RETURN json_build_object(
    'total_scores',      COALESCE(v_total,     0),
    'avg_score',         COALESCE(v_avg_score, 0),
    'avg_duration',      COALESCE(v_avg_dur,   0),
    'player_count',      COALESCE(v_pcount,    0),
    'conv_count',        COALESCE(v_conv,      0),
    'probefahrt',        COALESCE(v_pfahrt,    0),
    'angebot',           COALESCE(v_angebot,   0),
    'kein_kontakt',      COALESCE(v_kein,      0),
    'top_vehicle',       v_top_v,
    'top_vehicle_count', COALESCE(v_top_vc,    0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_analytics(uuid, text) TO anon;
