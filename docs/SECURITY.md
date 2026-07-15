# Security — Bekannte Einschränkungen & Entscheidungen

## Staff-PIN im Frontend-Code (bekannte Einschränkung)

**Was:** STAFF_PIN (`2882`) steht in `staff.js` und `wins.html` — im Browser-DevTools lesbar.

**Risiko:** Jemand mit Zugang zur URL + DevTools könnte den PIN lesen und Staff-Funktionen aufrufen (Event archivieren, Teilnehmerdaten exportieren).

**Warum so:** MVP-Architektur ohne Server-Session. Alle API-Calls gehen direkt Browser → PostgREST.

**Schutz heute:**
- Staff-URL (`/staff.html`, `/wins.html`) ist nicht öffentlich verlinkt
- PIN-Schutz vor versehentlichem Zugriff am Stand
- Alle schreibenden Aktionen PIN-gesichert serverseitig (SECURITY DEFINER)
- Kundendaten: `players`-Tabelle hat kein anon-SELECT (RLS) — Export nur via PIN+RPC

**Empfehlung für v2:** Server-Side Session (JWT nach Login, kein PIN im JS).

**PIN ändern:** `STAFF_PIN` in `staff.js` + `wins.html` + alle `get_event_*`-Funktionen in der DB.

## Anon-JWT im Frontend (design-bedingt, kein Risiko)

PostgREST-Standard: Anon-Key ist öffentlich (wie Supabase-Anon-Key).
RLS verhindert Zugriff auf geschützte Tabellen.
