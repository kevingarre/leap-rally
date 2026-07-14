-- ═══════════════════════════════════════════════════════════
-- LEAP CHARGE — Difficulty Presets Migration
-- Run once on existing DB to add difficulty columns to events.
-- Idempotent: ADD COLUMN IF NOT EXISTS safe to re-run.
-- Created: 2026-07-14
-- ═══════════════════════════════════════════════════════════

-- Difficulty tier: 'easy' | 'normal' | 'hard'
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'normal';

-- Ball speed overrides (NULL → use preset value for the chosen difficulty)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cfg_ball_base_speed real;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cfg_ball_max_speed real;

-- Lives override (NULL → use preset)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cfg_lives integer;

-- Instant-win score override; takes priority over legacy instant_win_score when set
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cfg_instant_win_score integer;

-- Extra-ball (double ball) toggle and minimum level
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cfg_extra_ball_enabled boolean;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cfg_extra_ball_min_level integer;

-- ── Quick-reference examples for staff ────────────────────
-- Set an event to hard difficulty:
--   UPDATE events SET difficulty = 'hard' WHERE is_active = true;
--
-- Override one value while keeping normal preset for everything else:
--   UPDATE events SET cfg_ball_base_speed = 0.55 WHERE is_active = true;
--
-- Disable double ball entirely for this event:
--   UPDATE events SET cfg_extra_ball_enabled = false WHERE is_active = true;
--
-- Reset all overrides (back to pure preset):
--   UPDATE events SET
--     cfg_ball_base_speed = NULL, cfg_ball_max_speed = NULL,
--     cfg_lives = NULL, cfg_instant_win_score = NULL,
--     cfg_extra_ball_enabled = NULL, cfg_extra_ball_min_level = NULL
--   WHERE is_active = true;
