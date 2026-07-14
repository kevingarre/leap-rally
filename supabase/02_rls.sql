-- ═══════════════════════════════════════════════════════════
-- LEAP CHARGE — Row Level Security
-- Anon-Key darf: Player + Score anlegen, Leaderboard lesen.
-- Admin/Staff-Aktionen laufen über service_role (serverseitig)
-- oder ein passwortgeschütztes Panel mit service key.
-- ═══════════════════════════════════════════════════════════

alter table events         enable row level security;
alter table players        enable row level security;
alter table scores         enable row level security;
alter table instant_wins   enable row level security;
alter table archived_events enable row level security;

-- ── EVENTS: nur aktives Event öffentlich lesbar ──
create policy "read active event" on events
  for select using (is_active = true);

-- ── PLAYERS: anon darf einfügen (Formular absenden) ──
create policy "insert player" on players
  for insert with check (true);
-- Kein öffentliches SELECT auf players (DSGVO!) — nur service_role.

-- ── SCORES: anon darf einfügen + lesen (fürs Leaderboard) ──
create policy "insert score" on scores
  for insert with check (true);
create policy "read scores" on scores
  for select using (true);

-- ── INSTANT_WINS: anon darf einfügen + eigene lesen ──
create policy "insert instant win" on instant_wins
  for insert with check (true);
create policy "read instant win" on instant_wins
  for select using (true);
-- Claim (update) nur über service_role im Staff-Panel.

-- archived_events: kein anon-Zugriff (nur service_role).

-- ═══════════════════════════════════════════════════════════
-- HINWEIS zur Sicherheit:
-- - Frontend (Spiel + Leaderboard + Live) nutzt anon-Key.
-- - Staff-Dashboard + Admin nutzen service_role-Key hinter
--   Passwortschutz (nie im Client-Bundle ausliefern → via
--   serverless Function / Vercel Edge, oder Passwort-Gate +
--   env-injizierter Key nur auf /staff /admin Routen).
-- ═══════════════════════════════════════════════════════════
