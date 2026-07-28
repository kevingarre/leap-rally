/* ═══════════════════════════════════════════════════════════
   LEAP CHARGE – Supabase REST API Helper
   Vanilla JS · fetch()-based · No build step · No npm
   Depends on: window.LEAP_SUPABASE (set in supabase-config.js)
   Must load AFTER supabase-config.js in index.html.
═══════════════════════════════════════════════════════════ */

'use strict';

// ── Global event state ──────────────────────────────────
// Populated by initLeapEvent() on app start.
// Shape: { id, name, instant_win_score, instant_win_ghost_req, terms_md, terms_version,
//           difficulty, cfg_ball_base_speed, cfg_ball_max_speed, cfg_lives,
//           cfg_instant_win_score, cfg_extra_ball_enabled, cfg_extra_ball_min_level }
window.LEAP_EVENT = null;

// ── Base fetch helper ───────────────────────────────────
/**
 * Internal: perform a Supabase REST call.
 * @param {string} path   – e.g. "/rest/v1/events"
 * @param {object} opts   – fetch options override
 * @returns {Promise<any>}
 */
async function _supaFetch(path, opts = {}) {
  const cfg = window.LEAP_SUPABASE;
  if (!cfg || !cfg.url || !cfg.anonKey) {
    throw new Error('LEAP_SUPABASE config not loaded');
  }
  const url = cfg.url + path;
  const headers = {
    'apikey':        cfg.anonKey,
    // Hetzner PostgREST authenticates the public role via apikey. Sending a
    // second Authorization header through the Nginx proxy can be parsed as a
    // malformed JWT ("Expected 3 parts; got 2").
    'Content-Type':  'application/json',
    'Accept':        'application/json',
    ...((opts.headers) || {}),
  };
  const response = await fetch(url, { ...opts, headers });
  if (!response.ok) {
    let detail = '';
    try { detail = JSON.stringify(await response.json()); } catch (_) {}
    throw new Error(`Supabase ${response.status} on ${path}: ${detail}`);
  }
  // 204 No Content → return null
  if (response.status === 204) return null;
  return response.json();
}

// ── Public API functions ────────────────────────────────

/**
 * Fetch the currently active event.
 * RLS: only is_active=true rows are readable with anon key.
 * Returns the first active event object, or null if none.
 */
async function getActiveEvent() {
  // Fetch base fields (always exist in the original schema).
  const baseRows = await _supaFetch(
    '/rest/v1/events?is_active=eq.true' +
    '&select=id,name,instant_win_score,instant_win_ghost_req,terms_md,terms_version' +
    '&limit=1'
  );
  if (!Array.isArray(baseRows) || baseRows.length === 0) return null;
  const ev = baseRows[0];

  // Try to fetch the difficulty/config columns separately (added by migration 04).
  // If the columns do not exist yet (migration not run), we silently fall back
  // to defaults — the game still works, just uses the normal preset.
  try {
    const cfgRows = await _supaFetch(
      '/rest/v1/events?id=eq.' + encodeURIComponent(ev.id) +
      '&select=difficulty,cfg_ball_base_speed,cfg_ball_max_speed,cfg_lives,' +
      'cfg_instant_win_score,cfg_extra_ball_enabled,cfg_extra_ball_min_level' +
      '&limit=1'
    );
    if (Array.isArray(cfgRows) && cfgRows.length > 0) {
      Object.assign(ev, cfgRows[0]);
    }
  } catch(e) {
    // Migration not yet applied — difficulty fields unavailable, use preset defaults.
    console.info('[LEAP] difficulty columns not found — using normal preset defaults.');
  }

  return ev;
}

/**
 * Create a player record.
 * @param {object} data – form fields matching players table columns
 * @returns {string} player UUID
 */
async function createPlayer(data) {
  const rows = await _supaFetch('/rest/v1/players', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!rows || !rows[0] || !rows[0].id) {
    throw new Error('createPlayer: no id returned');
  }
  return rows[0].id;
}

/**
 * Insert a score row.
 * @param {object} data – { event_id, player_id?, score, level_reached, ghost_overtaken, play_duration_s, is_instant_win }
 * @returns {string} score UUID
 */
async function submitScore(data) {
  const rows = await _supaFetch('/rest/v1/scores', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!rows || !rows[0] || !rows[0].id) {
    throw new Error('submitScore: no id returned');
  }
  return rows[0].id;
}

/**
 * Create an instant-win record.
 * @param {object} data – { event_id, score_id, claim_code }
 * @returns {string} claim_code
 */
async function createInstantWin(data) {
  const rows = await _supaFetch('/rest/v1/instant_wins', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!rows || !rows[0]) throw new Error('createInstantWin: no row returned');
  return rows[0].claim_code;
}

/**
 * Fetch top N leaderboard entries for an event.
 * Reads from the "leaderboard" view (SELECT-able via anon, no player PII).
 * @param {string} eventId
 * @param {number} limit   – default 10
 * @returns {Array}
 */
async function getLeaderboard(eventId, limit) {
  limit = limit || 10;
  const rows = await _supaFetch(
    '/rest/v1/leaderboard' +
    '?event_id=eq.' + encodeURIComponent(eventId) +
    '&order=best_score.desc' +
    '&limit=' + limit +
    '&select=player_id,first_name,last_name,city,best_score,any_ghost_overtaken,max_level'
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * ROBUSTER WEG: Player + Score (+ Instant-Win) in EINEM atomaren RPC-Call.
 * Sofort-Gewinn wird SERVERSEITIG bestimmt (nicht client-manipulierbar).
 * Nutzt Supabase-RPC submit_entry (SECURITY DEFINER).
 *
 * @param {object} f – Formular + Spiel-Daten:
 *   { event_id, score, ghost_overtaken, level_reached, play_duration_s,
 *     contact_intent, vehicle_interest, zip, city, first_name, last_name,
 *     email, phone, consent_stay, consent_offers, consent_partners,
 *     terms_accepted, terms_version, entry_source }
 * @returns {Promise<{player_id, score_id, is_instant_win, claim_code}>}
 */
async function submitEntry(f) {
  const body = {
    p_event_id:         f.event_id,
    p_score:            f.score,
    p_ghost_overtaken:  !!f.ghost_overtaken,
    p_level_reached:    f.level_reached || 1,
    p_play_duration_s:  f.play_duration_s || null,
    p_contact_intent:   f.contact_intent || null,
    p_vehicle_interest: f.vehicle_interest || null,
    p_zip:              f.zip || null,
    p_city:             f.city || null,
    p_first_name:       f.first_name || null,
    p_last_name:        f.last_name || null,
    p_email:            f.email || null,
    p_phone:            f.phone || null,
    p_consent_stay:     !!f.consent_stay,
    p_consent_offers:   !!f.consent_offers,
    p_consent_partners: !!f.consent_partners,
    p_terms_accepted:   !!f.terms_accepted,
    p_terms_version:    f.terms_version || 1,
    p_entry_source:     f.entry_source || 'byod',
  };
  const res = await _supaFetch('/rest/v1/rpc/submit_entry', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  // RPC returns a JSON object (PostgREST wraps scalar json directly)
  return res;
}

// ── App-start initialiser ───────────────────────────────

/**
 * Load the active event once at app start and store in window.LEAP_EVENT.
 * Retries up to 3 times with 1s/2s/3s backoff on failure.
 * Gracefully fails: if all attempts fail, LEAP_EVENT stays null (offline mode).
 */
async function initLeapEvent() {
  const DELAYS = [1000, 2000, 3000];
  for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
    try {
      const ev = await getActiveEvent();
      if (ev) {
        window.LEAP_EVENT = ev;
        window.LEAP_EVENT_LOAD_FAILED = false;
        console.info('[LEAP] Active event loaded (attempt ' + (attempt + 1) + '):', ev.name, '| id:', ev.id);
        return;
      } else {
        console.warn('[LEAP] No active event found in Supabase – offline mode.');
        window.LEAP_EVENT_LOAD_FAILED = true;
        return;
      }
    } catch (err) {
      if (attempt < DELAYS.length) {
        console.warn('[LEAP] Event load failed (attempt ' + (attempt + 1) + '), retrying in ' + DELAYS[attempt] + 'ms…', err.message);
        await new Promise(function(r) { setTimeout(r, DELAYS[attempt]); });
      } else {
        console.warn('[LEAP] Could not load event after ' + (DELAYS.length + 1) + ' attempts (offline mode):', err.message);
        window.LEAP_EVENT_LOAD_FAILED = true;
      }
    }
  }
}

/**
 * Update a score row after "keep playing" — only ever increases the score.
 * Requires migration 07_update_score_rpc.sql to be applied in Supabase.
 * @param {string} scoreId        – UUID of the existing score row
 * @param {number} finalScore     – final (higher) score
 * @param {number} [levelReached] – optional updated max level
 * @param {boolean} [ghostOvertaken] – optional updated ghost flag
 * @returns {Promise<void>}
 */
async function updateFinalScore(scoreId, finalScore, levelReached, ghostOvertaken) {
  const body = {
    p_score_id:       scoreId,
    p_final_score:    finalScore,
  };
  if (levelReached   != null) body.p_level_reached    = levelReached;
  if (ghostOvertaken != null) body.p_ghost_overtaken  = ghostOvertaken;
  await _supaFetch('/rest/v1/rpc/update_final_score', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Generate a zero-padded 4-digit claim code string, e.g. "0042".
 */
function generateClaimCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

// Kick off event load immediately (fire-and-forget, graceful degradation)
initLeapEvent();
