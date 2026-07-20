# Backend-Setup — LEAP CHARGE

> ⚠️ **ARCHIVIERT** — Supabase Cloud wird nicht mehr verwendet (seit 2026-07-15).
> Das aktuelle Backend ist PostgREST auf Hetzner-VPS.
> Aktuelle Infos: `docs/BACKEND-STATUS.md`

---

## Aktuelles Backend (seit 15. Juli 2026)

**PostgREST auf Hetzner** — `https://leapmotor.tt.kevingarre.de`

- PostgreSQL + PostgREST direkt auf dem VPS
- Migrations-SQLs: `supabase/01_schema.sql` … `09_missing_staff_rpcs.sql`
- Anon-Key in `js/supabase-config.js`
- Service-Key in 1Password → „OpenClaw Automation" → „Leapmotor PostgREST"

## Verbindung testen

```bash
curl "https://leapmotor.tt.kevingarre.de/rest/v1/events?select=id,name,is_active" \
  -H "apikey: <anon-key aus supabase-config.js>" \
  -H "Authorization: Bearer <anon-key>"
```

---

*Historische Supabase-Cloud-Infos: git history dieser Datei vor 2026-07-20.*
