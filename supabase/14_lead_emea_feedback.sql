-- Freigegebene LEAD_EMEA-Konstanten für die Leapmotor-Tischtennis-Aktivierung.
-- OFFER ist im 61-spaltigen Zielvertrag die technische Spalte für Level 0.

alter table event_export_profiles alter column constants set default
  '{"COUNTRYCODE":"DE","CAMPAIGN":"17646","OFFER":"EARNED MEDIA","LEVEL1":"EVENTS","LEVEL2":"QR","LEVEL3":"WWW","LEVEL4":"LEAPMOTOR","PROCESSTYPE":"Lead Self","BRAND":"LEAPMOTOR","LANGUAGE":"Tedesco","MARKET":"8803","DISCLAIMERID":"1699","COMMUNICATIONCHANNEL":"","CONSENT_TRUE":"1","CONSENT_FALSE":"0"}'::jsonb;

update event_export_profiles
set constants = constants ||
  '{"COUNTRYCODE":"DE","CAMPAIGN":"17646","OFFER":"EARNED MEDIA","LEVEL1":"EVENTS","LEVEL2":"QR","LEVEL3":"WWW","LEVEL4":"LEAPMOTOR","PROCESSTYPE":"Lead Self","BRAND":"LEAPMOTOR","LANGUAGE":"Tedesco","MARKET":"8803","DISCLAIMERID":"1699","COMMUNICATIONCHANNEL":""}'::jsonb,
    updated_at = now();
