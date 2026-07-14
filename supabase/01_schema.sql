-- ═══════════════════════════════════════════════════════════
-- LEAP CHARGE — Supabase Schema
-- Event-Activation Game · Multi-Weekend fähig
-- Erstellt: 2026-07-14
-- ═══════════════════════════════════════════════════════════

-- ── EVENTS ────────────────────────────────────────────────
-- Ein Event = ein Einsatz (z.B. "Autohaus Müller, WE 19.-20.07")
create table if not exists events (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  location               text,
  starts_at              timestamptz,
  ends_at                timestamptz,
  is_active              boolean not null default false,
  instant_win_score      integer not null default 1500,   -- konfigurierbar (legacy; cfg_instant_win_score hat Vorrang wenn gesetzt)
  instant_win_ghost_req  boolean not null default true,    -- Ghost überholen Pflicht
  terms_md               text,        -- Teilnahmebedingungen (Markdown), pro Event editierbar
  terms_version          integer not null default 1,       -- hochzählen bei Änderung
  -- Difficulty Presets (seit 2026-07-14)
  difficulty             text not null default 'normal',   -- 'easy' | 'normal' | 'hard'
  cfg_ball_base_speed    real,        -- Override; NULL = Preset-Wert
  cfg_ball_max_speed     real,        -- Override; NULL = Preset-Wert
  cfg_lives              integer,     -- Override; NULL = Preset-Wert
  cfg_instant_win_score  integer,     -- Override; NULL = instant_win_score (legacy) nutzen
  cfg_extra_ball_enabled boolean,     -- Doppelball an/aus; NULL = Preset-Wert
  cfg_extra_ball_min_level integer,   -- ab welchem Level Doppelball erlaubt; NULL = Preset
  created_at             timestamptz not null default now()
);

-- Nur genau EIN aktives Event zulassen (Partial Unique Index)
create unique index if not exists one_active_event
  on events (is_active) where is_active = true;

-- ── PLAYERS ───────────────────────────────────────────────
-- Ein Teilnehmer-Eintrag pro Formular-Absenden
create table if not exists players (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references events(id) on delete cascade,
  -- Formularfelder 1:1 aus Leapmotor Event-Seite
  contact_intent        text,        -- 'probefahrt' | 'angebot' | 'nein'
  vehicle_interest      text,        -- 't03' | 'b05' | 'b10' | 'c10'
  zip                   text,
  city                  text,
  first_name            text,
  last_name             text,
  email                 text,
  phone                 text,
  consent_stay_in_touch boolean not null default false,
  consent_better_offers boolean not null default false,
  consent_partners      boolean not null default false,
  terms_accepted        boolean not null default false,
  terms_version_at_entry integer,     -- welche TNB-Version akzeptiert wurde (Nachweis)
  privacy_accepted_at   timestamptz,
  -- Entry-Modus
  entry_source          text not null default 'byod',  -- 'byod' | 'staff_manual'
  created_at            timestamptz not null default now()
);
create index if not exists idx_players_event on players(event_id);
create index if not exists idx_players_created on players(created_at desc);

-- ── SCORES ────────────────────────────────────────────────
-- Ein Score pro Spieldurchlauf; ein Player kann mehrere Runs haben
create table if not exists scores (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  player_id        uuid references players(id) on delete set null,
  score            integer not null,
  ghost_overtaken  boolean not null default false,
  level_reached    integer not null default 1,
  play_duration_s  integer,
  is_instant_win   boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists idx_scores_event on scores(event_id);
create index if not exists idx_scores_leaderboard on scores(event_id, score desc);
create index if not exists idx_scores_created on scores(created_at desc);

-- ── INSTANT WINS ──────────────────────────────────────────
-- Sofort-Gewinn mit Claim-Code für Staff-Verifikation
create table if not exists instant_wins (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  score_id         uuid not null references scores(id) on delete cascade,
  claim_code       text not null,      -- 4-stellig, pro Event eindeutig
  claimed_at       timestamptz,
  claimed_by_staff text,
  created_at       timestamptz not null default now(),
  unique (event_id, claim_code)
);
create index if not exists idx_instant_wins_event on instant_wins(event_id);

-- ── ARCHIVED EVENTS ───────────────────────────────────────
-- Snapshot beim Reset: alle Daten eines Einsatzes weggesichert
create table if not exists archived_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null,
  event_name    text,
  archived_at   timestamptz not null default now(),
  player_count  integer,
  score_count   integer,
  snapshot_json jsonb not null       -- vollständiger Dump players+scores+wins
);

-- ═══════════════════════════════════════════════════════════
-- VIEW: Leaderboard (bester Score je Player, absteigend)
-- ═══════════════════════════════════════════════════════════
create or replace view leaderboard as
select
  s.event_id,
  p.id            as player_id,
  p.first_name,
  p.last_name,
  p.city,
  max(s.score)    as best_score,
  bool_or(s.ghost_overtaken) as any_ghost_overtaken,
  max(s.level_reached)       as max_level,
  min(s.created_at)          as first_play
from scores s
join players p on p.id = s.player_id
group by s.event_id, p.id, p.first_name, p.last_name, p.city
order by best_score desc;
