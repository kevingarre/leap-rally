/* ═══════════════════════════════════════════════════════════
   LEAP CHARGE – Supabase REST API Helper
   Vanilla JS · fetch()-based · No build step · No npm
   Depends on: window.LEAP_SUPABASE (set in supabase-config.js)
   Must load AFTER supabase-config.js in index.html.
═══════════════════════════════════════════════════════════ */

'use strict';

// ── Global event state ──────────────────────────────────
// Populated by initLeapEvent() on app start.
// Shape: { id, name, instant_win_score, instant_win_ghost_req, terms_md, terms_version }
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
    'Authorization': 'Bearer ' + cfg.anonKey,
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
  const rows = await _supaFetch(
    '/rest/v1/events?is_active=eq.true&select=id,name,instant_win_score,instant_win_ghost_req,terms_md,terms_version&limit=1'
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
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
 * Gracefully fails: if Supabase is unreachable, LEAP_EVENT stays null
 * and the game still runs (offline mode).
 */
async function initLeapEvent() {
  try {
    const ev = await getActiveEvent();
    if (ev) {
      window.LEAP_EVENT = ev;
      console.info('[LEAP] Active event loaded:', ev.name, '| id:', ev.id);
    } else {
      console.warn('[LEAP] No active event found in Supabase – offline mode.');
    }
  } catch (err) {
    console.warn('[LEAP] Could not load event from Supabase (offline mode):', err.message);
  }
}

/**
 * Generate a zero-padded 4-digit claim code string, e.g. "0042".
 */
function generateClaimCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

// Kick off event load immediately (fire-and-forget, graceful degradation)
initLeapEvent();
