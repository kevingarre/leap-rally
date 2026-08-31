-- ═══════════════════════════════════════════════════════════
-- LEAP RALLY — WordPress/Gewinnspiel Analytics RPC
-- Gibt Lead-Statistiken aus external_leads zurück.
-- PIN-gesichert via SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_wordpress_analytics(
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
  v_pfahrt     integer;
  v_angebot    integer;
  v_kein       integer;
  v_top_v      text;
  v_top_vc     integer;
  v_consent_mkt integer;
  v_by_dealer  json;
BEGIN
  IF p_staff_pin <> '2882' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Gesamtzahl (alle WordPress-Leads, nicht event-gefiltert —
  -- external_leads haben kein event_id, nur source_event text)
  SELECT COUNT(*)::integer INTO v_total
  FROM external_leads;

  SELECT
    COUNT(*) FILTER (WHERE contact_intent = 'probefahrt')::integer,
    COUNT(*) FILTER (WHERE contact_intent = 'angebot')::integer,
    COUNT(*) FILTER (WHERE contact_intent IS NULL OR contact_intent = '' OR contact_intent = 'nein')::integer,
    COUNT(*) FILTER (WHERE consent_stay_in_touch = true)::integer
  INTO v_pfahrt, v_angebot, v_kein, v_consent_mkt
  FROM external_leads;

  SELECT vehicle_interest, COUNT(*)::integer
  INTO v_top_v, v_top_vc
  FROM external_leads
  WHERE vehicle_interest IS NOT NULL AND vehicle_interest <> ''
  GROUP BY vehicle_interest ORDER BY COUNT(*) DESC LIMIT 1;

  -- Top-5 Händler nach Lead-Anzahl
  SELECT json_agg(row_to_json(x))
  INTO v_by_dealer
  FROM (
    SELECT dealer_name, dealer_city, COUNT(*)::integer AS lead_count
    FROM external_leads
    GROUP BY dealer_name, dealer_city
    ORDER BY COUNT(*) DESC
    LIMIT 5
  ) x;

  RETURN json_build_object(
    'total',             COALESCE(v_total,       0),
    'probefahrt',        COALESCE(v_pfahrt,      0),
    'angebot',           COALESCE(v_angebot,     0),
    'kein_kontakt',      COALESCE(v_kein,        0),
    'consent_marketing', COALESCE(v_consent_mkt, 0),
    'top_vehicle',       v_top_v,
    'top_vehicle_count', COALESCE(v_top_vc,      0),
    'top_dealers',       COALESCE(v_by_dealer,   '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wordpress_analytics(uuid, text) TO anon;
