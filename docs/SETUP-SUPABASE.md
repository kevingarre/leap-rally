# Supabase Setup — LEAP CHARGE (einmalig, ~3 Min)

Diese Schritte muss Kevin einmal durchführen. Danach übernimmt Joe alles Weitere.

## 1. Projekt anlegen
1. https://supabase.com → Login (GitHub-Login möglich)
2. "New Project"
   - Name: `leap-charge`
   - Region: **Frankfurt (eu-central-1)** ← DSGVO
   - DB-Passwort: generieren + in 1Password/Keychain sichern
3. Warten bis Projekt bereit (~2 Min)

## 2. Schema einspielen
1. Im Projekt links → **SQL Editor** → "New query"
2. Inhalt von `supabase/01_schema.sql` einfügen → **Run**
3. Neue Query → Inhalt von `supabase/02_rls.sql` einfügen → **Run**

## 3. Keys an Joe geben (in Keychain, NICHT im Chat)
Unter **Project Settings → API** findest du:
- **Project URL** (z.B. `https://xxxx.supabase.co`)
- **anon public key** (für Frontend)
- **service_role key** (nur Staff/Admin, geheim!)

In Keychain speichern:
```bash
security add-generic-password -s "leap-supabase-url"     -a "leap" -w "<PROJECT_URL>"
security add-generic-password -s "leap-supabase-anon"    -a "leap" -w "<ANON_KEY>"
security add-generic-password -s "leap-supabase-service" -a "leap" -w "<SERVICE_ROLE_KEY>"
```
Dann Joe kurz Bescheid geben — die URL + anon-Key dürfen ins Frontend-Bundle, der service_role-Key NICHT.

## 4. Erstes Event anlegen (optional, macht sonst Joe)
SQL Editor:
```sql
insert into events (name, location, is_active, instant_win_score)
values ('Testlauf', 'Dev', true, 1500);
```
