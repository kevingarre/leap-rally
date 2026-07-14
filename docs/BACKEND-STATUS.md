# Backend-Status — LEAP CHARGE (Supabase)

Stand: 2026-07-14

## Projekt
- Supabase-Projekt: **tischtennis**
- Project-Ref: `xyugoecalszyoptaxnxy`
- URL: `https://xyugoecalszyoptaxnxy.supabase.co`
- Region: (Projekt-Default; prüfen ob eu-central-1)

## Keys (in Apple Keychain, service=leap)
- `leap-supabase-url` — Project URL
- `leap-supabase-anon` — Publishable Key (`sb_publishable_...`) → Frontend
- `leap-supabase-service` — Secret Key (`sb_secret_...`) → Staff/Admin serverseitig
- Quelle: 1Password Vault „OpenClaw Automation" → Item „Supabase Project tischtennis"
- DB-Passwort ebenfalls im 1Password-Item.

## Migration ausgeführt (2026-07-14)
Direkt via Pooler `aws-0-eu-central-1.pooler.supabase.com:6543` (user `postgres.xyugoecalszyoptaxnxy`).
Hinweis: `db.<ref>.supabase.co:5432` löst per DNS NICHT auf → Pooler nutzen.
- 01_schema.sql → OK
- 02_rls.sql → OK
- Tabellen: events, players, scores, instant_wins, archived_events + View leaderboard

## Test-Event
- id: `226359d3-7292-4142-a447-56ce0c335c47`
- name: „Testlauf Dev", is_active=true, instant_win_score=1500

## Verifiziert
- Secret-Key: INSERT event OK (bypass RLS)
- Anon-Key: SELECT active event OK, nur erlaubte Spalten (RLS greift)

## Nächster Schritt (Sprint 2)
- Frontend supabase-Client (anon key) → Score-Submission (score, level_reached, ghost_overtaken, play_duration_s)
- Opt-In-Formular am Endscreen → players insert
- Real-Leaderboard aus View lesen
