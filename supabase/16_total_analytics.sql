-- ═══════════════════════════════════════════════════════════
-- LEAP RALLY — Gesamt-Analytics RPC (Game + Gewinnspiel)
-- PIN-gesichert via SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_total_analytics(
  p_event_id  uuid,
  p_staff_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_players   integer;
  v_game_pfahrt    integer;
  v_game_angebot   integer;
  v_wp_total       integer;
  v_wp_pfahrt      integer;
  v_wp_angebot     integer;
  v_consent_mkt    integer;
  v_top_v          text;
  v_top_vc         integer;
  v_by_dealer      json;
BEGIN
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Game
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE contact_intent = 'probefahrt')::integer,
    COUNT(*) FILTER (WHERE contact_intent = 'angebot')::integer
  INTO v_game_players, v_game_pfahrt, v_game_angebot
  FROM players WHERE event_id = p_event_id;

  -- WordPress
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE contact_intent ILIKE '%probefahrt%')::integer,
    COUNT(*) FILTER (WHERE contact_intent ILIKE '%angebot%')::integer,
    COUNT(*) FILTER (WHERE consent_stay_in_touch = true)::integer
  INTO v_wp_total, v_wp_pfahrt, v_wp_angebot, v_consent_mkt
  FROM external_leads;

  -- Top-Modell gesamt (Game + WordPress kombiniert)
  SELECT vehicle_interest, COUNT(*)::integer
  INTO v_top_v, v_top_vc
  FROM (
    SELECT vehicle_interest FROM players WHERE event_id = p_event_id AND vehicle_interest IS NOT NULL
    UNION ALL
    SELECT vehicle_interest FROM external_leads WHERE vehicle_interest IS NOT NULL AND vehicle_interest <> ''
  ) combined
  GROUP BY vehicle_interest ORDER BY COUNT(*) DESC LIMIT 1;

  -- Top-5 Händler gesamt
  SELECT json_agg(row_to_json(x))
  INTO v_by_dealer
  FROM (
    SELECT dealer_name, dealer_city, COUNT(*)::integer AS lead_count
    FROM (
      SELECT dealer_name, dealer_city FROM players
        WHERE event_id = p_event_id AND dealer_name IS NOT NULL AND dealer_name <> ''
      UNION ALL
      SELECT dealer_name, dealer_city FROM external_leads
        WHERE dealer_name IS NOT NULL AND dealer_name <> ''
    ) combined
    GROUP BY dealer_name, dealer_city
    ORDER BY COUNT(*) DESC
    LIMIT 5
  ) x;

  RETURN json_build_object(
    'game_players',      COALESCE(v_game_players, 0),
    'game_probefahrt',   COALESCE(v_game_pfahrt,  0),
    'game_angebot',      COALESCE(v_game_angebot, 0),
    'wp_total',          COALESCE(v_wp_total,     0),
    'wp_probefahrt',     COALESCE(v_wp_pfahrt,    0),
    'wp_angebot',        COALESCE(v_wp_angebot,   0),
    'consent_marketing', COALESCE(v_consent_mkt,  0),
    'top_vehicle',       v_top_v,
    'top_vehicle_count', COALESCE(v_top_vc,       0),
    'top_dealers',       COALESCE(v_by_dealer,    '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_analytics(uuid, text) TO anon;
