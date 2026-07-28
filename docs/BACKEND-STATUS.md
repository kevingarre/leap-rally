# Backend-Status — LEAP CHARGE

**Stand: 2026-07-20** (migriert 2026-07-15, commit `6b7cf44`)

## Aktuelles Backend
- **Kein Supabase Cloud mehr** — migriert am 15. Juli 2026
- **Stack:** PostgREST auf Hetzner-VPS (nginx/1.24.0, Ubuntu)
- **URL:** `https://leapmotor.tt.kevingarre.de`
- **API-Format:** PostgREST REST v1 (identische Schnittstelle wie Supabase Cloud)

## Keys
- **Frontend anon-Key:** in `js/supabase-config.js` (JWT, client-safe, RLS schützt Daten)
- **Service-Key (Admin):** 1Password Vault „OpenClaw Automation" → „Leapmotor PostgREST"
- **Staff-PIN:** 2882 (geändert bei Migration)

## Datenbank (PostgreSQL auf Hetzner)
- Tabellen: `events`, `players`, `scores`, `instant_wins`, `archived_events`
- View: `leaderboard`
- Migrations: `supabase/01_schema.sql` bis `09_missing_staff_rpcs.sql`

## Aktive Events
- `75c246f0-ee0c-46ac-8804-d78f5ec64761` — „Testevent", is_active=true

## Verifikation (2026-07-20)
```bash
curl "https://leapmotor.tt.kevingarre.de/rest/v1/events?select=id,name,is_active" \
  -H "apikey: <anon-key>" \
  -H "Origin: https://leapmotor.tt.kevingarre.de"
# → [{"id":"75c246f0...","name":"Testevent","is_active":true}]
```

## Browser-Zugriff

- Erlaubte Frontend-Origins: `https://leapmotor.tt.kevingarre.de` und
  `https://kevingarre.github.io`
- Der öffentliche Browser-Client sendet den JWT ausschließlich im `apikey`-Header.
  Ein zusätzlicher `Authorization`-Header wird vom Nginx/PostgREST-Proxy als
  fehlerhafter JWT interpretiert.

## Nicht mehr gültig
- ~~`xyugoecalszyoptaxnxy.supabase.co`~~ — alter Supabase-Cloud-Endpunkt, nicht mehr aktiv
- ~~Keychain `LEAP_SUPABASE_URL`~~ — veralteter Eintrag, zeigt noch auf alte URL
