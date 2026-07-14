/* ═══════════════════════════════════════════════════════════
   LEAP CHARGE — Staff Panel Logic
   Vanilla JS · fetch() · Supabase REST + RPC (anon key)
   Depends on: window.LEAP_SUPABASE (set in supabase-config.js)

   PIN ÄNDERN:
     Konstante STAFF_PIN unten auf neuen Wert setzen.
     Der gleiche PIN muss in supabase/06_staff_rpc.sql gepflegt werden.
═══════════════════════════════════════════════════════════ */

'use strict';

// ── Konstante PIN (leicht änderbar) ──────────────────────────
var STAFF_PIN = '1234';

// ── sessionStorage Keys ───────────────────────────────────────
var SS_AUTHED       = 'leap_staff_authed';
var SS_ATTEMPTS     = 'leap_staff_attempts';
var SS_LOCKED_UNTIL = 'leap_staff_locked_until';

var MAX_ATTEMPTS    = 3;
var LOCKOUT_SEC     = 30;

// ── Runtime State ────────────────────────────────────────────
var currentEventId   = null;
var currentEventName = null;
var lockoutTimer     = null;
var toastTimer     = null;

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
  var pinInput = document.getElementById('pin-input');
  if (pinInput) {
    pinInput.addEventListener('input', function () {
      updatePinDots(this.value);
    });
    pinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handlePinSubmit();
    });
  }

  if (isAuthed()) {
    showDashboard();
  } else {
    var remaining = getLockoutRemaining();
    if (remaining > 0) {
      showPinError('Gesperrt für noch ' + remaining + ' Sekunden.');
      startLockoutCountdown();
    }
    if (pinInput) {
      setTimeout(function () { pinInput.focus(); }, 100);
    }
  }
});

// ══════════════════════════════════════════════════════════════
// AUTH — PIN logic
// ══════════════════════════════════════════════════════════════
function isAuthed() {
  return sessionStorage.getItem(SS_AUTHED) === '1';
}

function getLockoutRemaining() {
  var until = parseInt(sessionStorage.getItem(SS_LOCKED_UNTIL) || '0', 10);
  var remaining = Math.ceil((until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

function getAttempts() {
  return parseInt(sessionStorage.getItem(SS_ATTEMPTS) || '0', 10);
}

function updatePinDots(val) {
  var len = val ? val.length : 0;
  for (var i = 0; i < 4; i++) {
    var dot = document.getElementById('pd-' + i);
    if (!dot) continue;
    if (i < len) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  }
}

function handlePinSubmit() {
  var remaining = getLockoutRemaining();
  if (remaining > 0) {
    showPinError('Noch ' + remaining + ' Sekunden gesperrt.');
    return;
  }

  var pinInput = document.getElementById('pin-input');
  var pin = pinInput ? pinInput.value.trim() : '';

  if (!pin || pin.length < 4) {
    showPinError('Bitte 4–6-stelligen PIN eingeben.');
    return;
  }

  if (pin === STAFF_PIN) {
    // Correct PIN
    sessionStorage.setItem(SS_AUTHED, '1');
    sessionStorage.removeItem(SS_ATTEMPTS);
    sessionStorage.removeItem(SS_LOCKED_UNTIL);
    clearLockoutTimer();
    showDashboard();
  } else {
    // Wrong PIN
    var attempts = getAttempts() + 1;
    sessionStorage.setItem(SS_ATTEMPTS, String(attempts));

    if (attempts >= MAX_ATTEMPTS) {
      var until = Date.now() + LOCKOUT_SEC * 1000;
      sessionStorage.setItem(SS_LOCKED_UNTIL, String(until));
      sessionStorage.removeItem(SS_ATTEMPTS);
      showPinError('Zu viele Fehlversuche! Gesperrt für ' + LOCKOUT_SEC + ' Sekunden.');
      if (pinInput) { pinInput.value = ''; }
      updatePinDots('');
      startLockoutCountdown();
    } else {
      var left = MAX_ATTEMPTS - attempts;
      showPinError('Falscher PIN. Noch ' + left + ' Versuch' + (left === 1 ? '' : 'e') + '.');
      if (pinInput) { pinInput.value = ''; }
      updatePinDots('');
    }
  }
}

function startLockoutCountdown() {
  clearLockoutTimer();
  lockoutTimer = setInterval(function () {
    var remaining = getLockoutRemaining();
    if (remaining <= 0) {
      clearLockoutTimer();
      var errEl = document.getElementById('pin-error');
      if (errEl) errEl.style.display = 'none';
    } else {
      showPinError('Gesperrt. Noch ' + remaining + ' Sekunden.');
    }
  }, 1000);
}

function clearLockoutTimer() {
  if (lockoutTimer !== null) {
    clearInterval(lockoutTimer);
    lockoutTimer = null;
  }
}

function showPinError(msg) {
  var el = document.getElementById('pin-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function logout() {
  sessionStorage.removeItem(SS_AUTHED);
  currentEventId = null;
  showPinScreen();
}

// ══════════════════════════════════════════════════════════════
// SCREENS
// ══════════════════════════════════════════════════════════════
function showPinScreen() {
  var pinScreen = document.getElementById('screen-pin');
  var dashScreen = document.getElementById('screen-dashboard');
  var pinInput  = document.getElementById('pin-input');
  var pinError  = document.getElementById('pin-error');

  if (pinScreen)  pinScreen.style.display  = 'flex';
  if (dashScreen) dashScreen.style.display = 'none';
  if (pinInput)   { pinInput.value = ''; setTimeout(function () { pinInput.focus(); }, 100); }
  if (pinError)   pinError.style.display   = 'none';
  updatePinDots('');

  var remaining = getLockoutRemaining();
  if (remaining > 0) {
    showPinError('Gesperrt für noch ' + remaining + ' Sekunden.');
    startLockoutCountdown();
  }
}

function showDashboard() {
  var pinScreen  = document.getElementById('screen-pin');
  var dashScreen = document.getElementById('screen-dashboard');
  if (pinScreen)  pinScreen.style.display  = 'none';
  if (dashScreen) {
    dashScreen.style.display       = 'flex';
    dashScreen.style.flexDirection = 'column';
  }
  loadDashboard();
}

// ══════════════════════════════════════════════════════════════
// SUPABASE REST HELPER
// ══════════════════════════════════════════════════════════════
function supaFetch(path, opts) {
  if (!opts) { opts = {}; }
  var cfg = window.LEAP_SUPABASE;
  if (!cfg || !cfg.url || !cfg.anonKey) {
    return Promise.reject(new Error('LEAP_SUPABASE config nicht geladen'));
  }
  var url = cfg.url + path;
  var headers = Object.assign({
    'apikey':        cfg.anonKey,
    'Authorization': 'Bearer ' + cfg.anonKey,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  }, opts.headers || {});
  var fetchOpts = Object.assign({}, opts, { headers: headers });
  return fetch(url, fetchOpts).then(function (response) {
    if (!response.ok) {
      return response.json().catch(function () { return null; }).then(function (body) {
        var detail = body ? JSON.stringify(body) : '';
        throw new Error('Supabase ' + response.status + ': ' + detail);
      });
    }
    if (response.status === 204) return null;
    return response.json();
  });
}

function callRpc(funcName, body) {
  return supaFetch('/rest/v1/rpc/' + funcName, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function loadDashboard() {
  loadActiveEvent().then(function () {
    return Promise.all([loadLeaderboard(), loadInstantWins()]);
  }).catch(function (err) {
    console.error('[Staff] loadDashboard error:', err);
  });
}

// ══════════════════════════════════════════════════════════════
// A: AKTIVES EVENT
// ══════════════════════════════════════════════════════════════
function loadActiveEvent() {
  var card = document.getElementById('event-card');
  if (card) card.innerHTML = '<div class="msg-loading">⏳ Lade Event…</div>';
  currentEventId = null;

  return supaFetch(
    '/rest/v1/events?is_active=eq.true' +
    '&select=id,name,location,starts_at,ends_at,difficulty,instant_win_score,instant_win_ghost_req' +
    '&limit=1'
  ).then(function (rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      if (card) {
        card.innerHTML =
          '<div class="msg-empty">⚠️ Kein aktives Event gefunden.</div>' +
          '<div style="padding:0 0 4px;">' +
            '<button class="btn-action" onclick="openNewEventForm()">🆕 Erstes Event anlegen</button>' +
          '</div>';
      }
      openNewEventForm();
      return;
    }
    var ev = rows[0];
    currentEventId   = ev.id;
    currentEventName = ev.name || '';
    renderEventCard(ev);
    loadEventStats(ev.id);
  }).catch(function (err) {
    if (card) card.innerHTML = '<div class="msg-error">⚠️ Fehler: ' + escHtml(err.message) + '</div>';
  });
}

function renderEventCard(ev) {
  var card = document.getElementById('event-card');
  if (!card) return;

  var start = ev.starts_at
    ? new Date(ev.starts_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : '–';
  var end = ev.ends_at
    ? new Date(ev.ends_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : '–';

  var diffOptions = ['easy', 'normal', 'hard'].map(function (d) {
    return '<option value="' + d + '"' + (ev.difficulty === d ? ' selected' : '') + '>' +
      (d === 'easy' ? 'Easy' : d === 'normal' ? 'Normal' : 'Hard') + '</option>';
  }).join('');

  card.innerHTML =
    '<div class="event-name">' + escHtml(ev.name) + '</div>' +
    '<div class="event-meta">' +
      '<span>📍 ' + escHtml(ev.location || '–') + '</span>' +
      '<span>📅 ' + escHtml(start) + ' → ' + escHtml(end) + '</span>' +
    '</div>' +
    '<div class="stats-row">' +
      '<div class="stat-box">' +
        '<span class="stat-value" id="stat-players">…</span>' +
        '<span class="stat-label">Spieler</span>' +
      '</div>' +
      '<div class="stat-box">' +
        '<span class="stat-value" id="stat-scores">…</span>' +
        '<span class="stat-label">Runs</span>' +
      '</div>' +
      '<div class="stat-box">' +
        '<span class="stat-value" id="stat-wins">…</span>' +
        '<span class="stat-label">Wins</span>' +
      '</div>' +
    '</div>' +
    '<div class="difficulty-row">' +
      '<span class="difficulty-label">Schwierigkeit:</span>' +
      '<select class="diff-select" id="diff-select" onchange="changeDifficulty(this.value)">' +
        diffOptions +
      '</select>' +
    '</div>' +
    '<button class="btn-action" onclick="exportEventCSV(currentEventId, currentEventName, this)">' +
      '📥 Teilnehmerliste exportieren (CSV)' +
    '</button>' +
    '<button class="btn-action" onclick="window.open(\'leaderboard.html\', \'_blank\')">' +
      '📺 TV-Leaderboard öffnen' +
    '</button>' +
    '<button class="btn-action" onclick="copyDemoLink(this)">' +
      '🎮 Demo-Link kopieren' +
    '</button>' +
    '<button class="btn-action" onclick="openNewEventForm()">' +
      '🗄 Event archivieren &amp; Neues anlegen' +
    '</button>';
}

function loadEventStats(eventId) {
  return Promise.all([
    supaFetch('/rest/v1/leaderboard?event_id=eq.' + encodeURIComponent(eventId) + '&select=player_id'),
    supaFetch('/rest/v1/scores?event_id=eq.' + encodeURIComponent(eventId) + '&select=id'),
    supaFetch('/rest/v1/instant_wins?event_id=eq.' + encodeURIComponent(eventId) + '&select=id'),
  ]).then(function (results) {
    var lbRows    = results[0];
    var scoreRows = results[1];
    var winRows   = results[2];

    var pEl = document.getElementById('stat-players');
    var sEl = document.getElementById('stat-scores');
    var wEl = document.getElementById('stat-wins');
    if (pEl) pEl.textContent = Array.isArray(lbRows)    ? lbRows.length    : '?';
    if (sEl) sEl.textContent = Array.isArray(scoreRows)  ? scoreRows.length  : '?';
    if (wEl) wEl.textContent = Array.isArray(winRows)    ? winRows.length    : '?';
  }).catch(function (err) {
    console.warn('[Staff] loadEventStats:', err.message);
  });
}

function changeDifficulty(diff) {
  if (!currentEventId) {
    showToast('Kein aktives Event.', true);
    return;
  }
  var sel = document.getElementById('diff-select');
  if (sel) sel.disabled = true;

  callRpc('update_event_difficulty', {
    p_event_id:   currentEventId,
    p_difficulty: diff,
    p_staff_pin:  STAFF_PIN,
  }).then(function () {
    showToast('✅ Schwierigkeit auf "' + escHtml(diff) + '" gesetzt.');
  }).catch(function (err) {
    showToast('⚠️ Fehler: ' + err.message, true);
  }).then(function () {
    if (sel) sel.disabled = false;
  });
}

// ══════════════════════════════════════════════════════════════
// B: NEUES EVENT ANLEGEN
// ══════════════════════════════════════════════════════════════
function openNewEventForm() {
  var sec = document.getElementById('new-event-section');
  if (!sec) return;
  sec.style.display = 'block';

  // Pre-fill default datetimes
  var now = new Date();
  var twoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  var startEl = document.getElementById('nef-start');
  var endEl   = document.getElementById('nef-end');
  if (startEl && !startEl.value) startEl.value = toDatetimeLocal(now);
  if (endEl   && !endEl.value)   endEl.value   = toDatetimeLocal(twoDays);

  document.getElementById('new-event-msg').innerHTML = '';

  setTimeout(function () {
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function closeNewEventForm() {
  var sec = document.getElementById('new-event-section');
  if (sec) sec.style.display = 'none';
  var msgEl = document.getElementById('new-event-msg');
  if (msgEl) msgEl.innerHTML = '';
}

function toDatetimeLocal(date) {
  function pad(n) { return String(n).padStart(2, '0'); }
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes());
}

function handleNewEvent(e) {
  e.preventDefault();

  var btn   = document.getElementById('nef-submit-btn');
  var msgEl = document.getElementById('new-event-msg');
  msgEl.innerHTML = '';

  var name      = document.getElementById('nef-name').value.trim();
  var location  = document.getElementById('nef-location').value.trim();
  var startVal  = document.getElementById('nef-start').value;
  var endVal    = document.getElementById('nef-end').value;
  var threshold = parseInt(document.getElementById('nef-threshold').value, 10) || 1500;
  var ghostReq  = document.getElementById('nef-ghost').checked;

  if (!name) {
    msgEl.innerHTML = '<div class="msg-error">⚠️ Event-Name ist Pflichtfeld.</div>';
    return;
  }
  if (!location) {
    msgEl.innerHTML = '<div class="msg-error">⚠️ Ort ist Pflichtfeld.</div>';
    return;
  }

  var confirmText = currentEventId
    ? 'Altes Event archivieren und neues Event "' + name + '" starten?'
    : 'Neues Event "' + name + '" anlegen?';

  if (!confirm(confirmText)) return;

  btn.disabled    = true;
  btn.textContent = '⏳ Wird verarbeitet…';

  var startsAt = startVal ? new Date(startVal).toISOString() : null;
  var endsAt   = endVal   ? new Date(endVal).toISOString()   : null;

  callRpc('archive_and_new_event', {
    p_name:              name,
    p_location:          location,
    p_starts_at:         startsAt,
    p_ends_at:           endsAt,
    p_instant_win_score: threshold,
    p_ghost_req:         ghostReq,
    p_staff_pin:         STAFF_PIN,
  }).then(function (result) {
    var playerCount = (result && result.old_player_count) || 0;
    var scoreCount  = (result && result.old_score_count)  || 0;
    var archiveInfo = currentEventId
      ? ' Archiviert: ' + playerCount + ' Spieler, ' + scoreCount + ' Runs.'
      : '';
    msgEl.innerHTML =
      '<div class="msg-success">✅ Event "' + escHtml(name) + '" gestartet!' + escHtml(archiveInfo) + '</div>';

    // Reset form fields
    document.getElementById('nef-name').value      = '';
    document.getElementById('nef-location').value  = '';
    document.getElementById('nef-start').value     = '';
    document.getElementById('nef-end').value       = '';
    document.getElementById('nef-threshold').value = '1500';
    document.getElementById('nef-ghost').checked   = true;

    setTimeout(function () {
      closeNewEventForm();
      loadDashboard();
    }, 2200);
  }).catch(function (err) {
    msgEl.innerHTML = '<div class="msg-error">⚠️ Fehler: ' + escHtml(err.message) + '</div>';
  }).then(function () {
    btn.disabled    = false;
    btn.textContent = '🗄 Altes archivieren & Neues Event starten';
  });
}

// ══════════════════════════════════════════════════════════════
// C: TOP-SCORES / LEADERBOARD (max 20)
// ══════════════════════════════════════════════════════════════
function loadLeaderboard() {
  var cont = document.getElementById('leaderboard-content');
  if (!cont) return Promise.resolve();

  if (!currentEventId) {
    cont.innerHTML = '<div class="msg-empty">Kein aktives Event.</div>';
    return Promise.resolve();
  }
  cont.innerHTML = '<div class="msg-loading">⏳ Lade Leaderboard…</div>';

  return supaFetch(
    '/rest/v1/leaderboard' +
    '?event_id=eq.' + encodeURIComponent(currentEventId) +
    '&order=best_score.desc' +
    '&limit=20' +
    '&select=player_id,first_name,last_name,city,best_score,any_ghost_overtaken,max_level'
  ).then(function (rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      cont.innerHTML = '<div class="msg-empty">Noch keine Scores für dieses Event.</div>';
      return;
    }
    var html =
      '<div class="table-scroll">' +
      '<table class="staff-table"><thead><tr>' +
        '<th>Rang</th>' +
        '<th>Name</th>' +
        '<th>Stadt</th>' +
        '<th>Score</th>' +
        '<th>Level</th>' +
        '<th>Ghost</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < rows.length; i++) {
      var row  = rows[i];
      var rank = i + 1;
      var rankClass = rank === 1 ? 'cell-rank gold' : rank === 2 ? 'cell-rank silver' : rank === 3 ? 'cell-rank bronze' : 'cell-rank';
      var firstName = row.first_name || '';
      var lastName  = row.last_name  || '';
      var name      = (firstName + ' ' + lastName).trim() || '–';
      var ghost     = row.any_ghost_overtaken;

      html +=
        '<tr>' +
          '<td class="' + rankClass + '">' + rank + '</td>' +
          '<td>' + escHtml(name) + '</td>' +
          '<td>' + escHtml(row.city || '–') + '</td>' +
          '<td class="cell-score">' + formatNum(row.best_score) + '</td>' +
          '<td>' + escHtml(String(row.max_level || 1)) + '</td>' +
          '<td class="' + (ghost ? 'cell-ghost-yes' : 'cell-ghost-no') + '">' +
            (ghost ? '✓' : '–') +
          '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    html += '<div style="padding:8px 0 4px;">' +
      '<button class="btn-action" onclick="exportEventCSV(currentEventId, currentEventName, this)">' +
      '📥 Alle Scores exportieren (CSV)</button></div>';
    cont.innerHTML = html;
  }).catch(function (err) {
    cont.innerHTML = '<div class="msg-error" style="margin:12px;">⚠️ Fehler: ' + escHtml(err.message) + '</div>';
  });
}

// ══════════════════════════════════════════════════════════════
// D: INSTANT WIN CODES
// ══════════════════════════════════════════════════════════════
function loadInstantWins() {
  var cont = document.getElementById('wins-content');
  if (!cont) return Promise.resolve();

  if (!currentEventId) {
    cont.innerHTML = '<div class="msg-empty">Kein aktives Event.</div>';
    return Promise.resolve();
  }
  cont.innerHTML = '<div class="msg-loading">⏳ Lade Gewinn-Codes…</div>';

  return callRpc('get_staff_wins', {
    p_event_id:  currentEventId,
    p_staff_pin: STAFF_PIN,
  }).then(function (data) {
    // RPC returns json_agg → can be null (no rows) or an array
    var list = Array.isArray(data) ? data : (data ? [data] : []);

    if (list.length === 0) {
      cont.innerHTML = '<div class="msg-empty">Noch keine Gewinn-Codes für dieses Event.</div>';
      return;
    }

    var html =
      '<div class="table-scroll">' +
      '<table class="staff-table"><thead><tr>' +
        '<th>Code</th>' +
        '<th>Spieler</th>' +
        '<th>Score</th>' +
        '<th>Zeitstempel</th>' +
        '<th>Status</th>' +
        '<th>Einlösen</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < list.length; i++) {
      var row     = list[i];
      var code    = row.claim_code || '–';
      var fn      = row.first_name || '';
      var ln      = row.last_name  || '';
      var pName   = (fn + ' ' + ln).trim() || '–';
      var ts      = row.created_at
        ? new Date(row.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
        : '–';
      var claimed    = !!row.claimed_at;
      var claimedTs  = row.claimed_at
        ? new Date(row.claimed_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
        : '';

      var statusCell = claimed
        ? '<span class="badge badge-claimed">✓ Eingelöst' +
            (claimedTs ? '<span class="badge-ts">' + escHtml(claimedTs) + '</span>' : '') +
          '</span>'
        : '<span class="badge badge-open">Offen</span>';

      var actionCell = claimed
        ? '<button class="btn-claim" disabled>✓ Erledigt</button>'
        : '<button class="btn-claim" onclick="claimWin(\'' + escAttr(code) + '\',this)">Einlösen</button>';

      html +=
        '<tr>' +
          '<td class="cell-code">' + escHtml(code) + '</td>' +
          '<td>' + escHtml(pName) + '</td>' +
          '<td class="cell-score">' + formatNum(row.score) + '</td>' +
          '<td>' + escHtml(ts) + '</td>' +
          '<td>' + statusCell + '</td>' +
          '<td>' + actionCell + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    cont.innerHTML = html;
  }).catch(function (err) {
    cont.innerHTML = '<div class="msg-error" style="margin:12px;">⚠️ Fehler: ' + escHtml(err.message) + '</div>';
  });
}

function claimWin(code, btn) {
  if (!currentEventId) {
    showToast('Kein aktives Event.', true);
    return;
  }
  if (!confirm('Code "' + code + '" als eingelöst markieren?\nSpieler hat den Code vorgezeigt.')) {
    return;
  }

  btn.disabled    = true;
  btn.textContent = '⏳…';

  callRpc('claim_instant_win', {
    p_code:      code,
    p_event_id:  currentEventId,
    p_staff_pin: STAFF_PIN,
  }).then(function (result) {
    if (result === true || result === 'true') {
      showToast('✅ Code "' + code + '" eingelöst!');
      setTimeout(loadInstantWins, 800);
    } else {
      showToast('⚠️ Code "' + code + '" nicht gefunden oder bereits eingelöst.', true);
      btn.disabled    = false;
      btn.textContent = 'Einlösen';
    }
  }).catch(function (err) {
    showToast('⚠️ Fehler: ' + err.message, true);
    btn.disabled    = false;
    btn.textContent = 'Einlösen';
  });
}

// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

/** Escape HTML entities to prevent XSS in innerHTML */
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape for HTML attribute values in onclick strings */
function escAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

/** Format numbers with locale (1234 → 1.234) */
function formatNum(n) {
  var num = parseInt(n, 10);
  if (isNaN(num)) return '0';
  return num.toLocaleString('de-DE');
}

/** Show a toast notification */
function showToast(msg, isError) {
  var t = document.getElementById('staff-toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = isError ? 'toast-error show' : 'show';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.className = t.className.replace('show', '').trim();
  }, 3800);
}

// ══════════════════════════════════════════════════════════════
// DEMO-LINK
// ══════════════════════════════════════════════════════════════
function copyDemoLink(btn) {
  var base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/index.html');
  var demoUrl = base + '?demo=1';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(demoUrl).then(function() {
      showToast('🎮 Demo-Link kopiert: ' + demoUrl);
      if (btn) { var orig = btn.textContent; btn.textContent = '✅ Kopiert!'; setTimeout(function() { btn.textContent = orig; }, 2000); }
    }).catch(function(err) {
      showToast('⚠️ Kopieren fehlgeschlagen: ' + err.message, true);
    });
  } else {
    // Fallback: prompt
    window.prompt('Demo-Link (manuell kopieren):', demoUrl);
  }
}

// ══════════════════════════════════════════════════════════════
// MIGRATION SQL — eingebettet für Clipboard-Copy im Setup-Panel
// ══════════════════════════════════════════════════════════════
var MIGRATION_04_SQL = `-- ═══════════════════════════════════════════════════════════
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
`;

var MIGRATION_06_SQL = `-- ═══════════════════════════════════════════════════════════
-- LEAP CHARGE — Staff-RPCs (SECURITY DEFINER)
-- Ausführen: Supabase Dashboard → SQL Editor → ausführen
--
-- SECURITY DEFINER: Funktionen laufen als postgres-User →
--   umgehen RLS und dürfen events / archived_events schreiben.
--   Grant to anon → aufrufbar per anon key vom Staff-Panel.
--
-- PIN ÄNDERN:
--   In allen 4 Funktionen den String '1234' durch neuen PIN ersetzen.
--   Suche nach:  IF p_staff_pin <> '1234' THEN
-- ═══════════════════════════════════════════════════════════


-- ── 1. archive_and_new_event ─────────────────────────────────
-- Archiviert aktuelles Event (Snapshot + deaktivieren) und
-- legt sofort ein neues aktives Event an.
-- Gibt { new_event_id, archive_id, old_player_count, old_score_count } zurück.
CREATE OR REPLACE FUNCTION public.archive_and_new_event(
  p_name              text,
  p_location          text,
  p_starts_at         timestamptz,
  p_ends_at           timestamptz,
  p_instant_win_score integer,
  p_ghost_req         boolean,
  p_staff_pin         text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_id     uuid;
  v_old_name   text;
  v_snapshot   jsonb;
  v_players    integer := 0;
  v_scores     integer := 0;
  v_archive_id uuid;
  v_new_id     uuid;
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '1234' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  -- ── Altes aktives Event ermitteln ───────────────────────────
  SELECT id, name
    INTO v_old_id, v_old_name
    FROM events
   WHERE is_active = true
   LIMIT 1;

  -- ── Archivieren wenn vorhanden ──────────────────────────────
  IF v_old_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'event',   row_to_json(e.*),
      'players', (SELECT jsonb_agg(row_to_json(p.*)) FROM players p WHERE p.event_id = v_old_id),
      'scores',  (SELECT jsonb_agg(row_to_json(s.*)) FROM scores  s WHERE s.event_id = v_old_id),
      'wins',    (SELECT jsonb_agg(row_to_json(w.*)) FROM instant_wins w WHERE w.event_id = v_old_id)
    )
    INTO v_snapshot
    FROM events e
   WHERE e.id = v_old_id;

    SELECT count(*) INTO v_players FROM players     WHERE event_id = v_old_id;
    SELECT count(*) INTO v_scores  FROM scores      WHERE event_id = v_old_id;

    INSERT INTO archived_events (event_id, event_name, player_count, score_count, snapshot_json)
    VALUES (v_old_id, v_old_name, v_players, v_scores, coalesce(v_snapshot, '{}'::jsonb))
    RETURNING id INTO v_archive_id;

    UPDATE events SET is_active = false WHERE id = v_old_id;

    RAISE NOTICE 'Event "%" archiviert: % Spieler, % Scores.', v_old_name, v_players, v_scores;
  END IF;

  -- ── Neues Event anlegen ─────────────────────────────────────
  INSERT INTO events (
    name,
    location,
    starts_at,
    ends_at,
    is_active,
    instant_win_score,
    instant_win_ghost_req
  ) VALUES (
    trim(p_name),
    p_location,
    p_starts_at,
    p_ends_at,
    true,
    coalesce(p_instant_win_score, 1500),
    coalesce(p_ghost_req, true)
  )
  RETURNING id INTO v_new_id;

  RETURN json_build_object(
    'new_event_id',     v_new_id,
    'archive_id',       v_archive_id,
    'old_player_count', v_players,
    'old_score_count',  v_scores
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_and_new_event(
  text, text, timestamptz, timestamptz, integer, boolean, text
) TO anon, authenticated;


-- ── 2. update_event_difficulty ───────────────────────────────
-- Setzt difficulty ('easy'|'normal'|'hard') des aktiven Events.
-- Gibt true zurück bei Erfolg.
CREATE OR REPLACE FUNCTION public.update_event_difficulty(
  p_event_id   uuid,
  p_difficulty text,
  p_staff_pin  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '1234' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  IF p_difficulty NOT IN ('easy', 'normal', 'hard') THEN
    RAISE EXCEPTION 'invalid_difficulty: must be easy|normal|hard';
  END IF;

  UPDATE events
     SET difficulty = p_difficulty
   WHERE id = p_event_id
     AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found_or_inactive';
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_event_difficulty(uuid, text, text)
  TO anon, authenticated;


-- ── 3. claim_instant_win ─────────────────────────────────────
-- Markiert einen Gewinn-Code als eingelöst (Staff-Verifikation vor Ort).
-- Setzt claimed_at=now(), claimed_by_staff='staff'.
-- Gibt true zurück wenn erfolgreich, false wenn Code nicht gefunden / bereits eingelöst.
CREATE OR REPLACE FUNCTION public.claim_instant_win(
  p_code      text,
  p_event_id  uuid,
  p_staff_pin text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_id uuid;
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '1234' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  -- Nur offene (noch nicht eingelöste) Codes matchen
  SELECT id
    INTO v_row_id
    FROM instant_wins
   WHERE claim_code  = p_code
     AND event_id    = p_event_id
     AND claimed_at IS NULL;

  IF v_row_id IS NULL THEN
    -- Nicht gefunden oder bereits eingelöst
    RETURN false;
  END IF;

  UPDATE instant_wins
     SET claimed_at       = now(),
         claimed_by_staff = 'staff'
   WHERE id = v_row_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_instant_win(text, uuid, text)
  TO anon, authenticated;


-- ── 4. get_staff_wins ────────────────────────────────────────
-- Gibt alle Instant-Win-Codes eines Events inkl. Spieler-Name + Score zurück.
-- HINWEIS: Bonus-RPC, nötig weil anon kein SELECT auf players hat (DSGVO-RLS).
--   SECURITY DEFINER erlaubt den players-JOIN ohne RLS-Konflikt.
CREATE OR REPLACE FUNCTION public.get_staff_wins(
  p_event_id  uuid,
  p_staff_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '1234' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT
        iw.id,
        iw.claim_code,
        iw.created_at,
        iw.claimed_at,
        iw.claimed_by_staff,
        s.score,
        p.first_name,
        p.last_name
      FROM instant_wins iw
      JOIN scores  s ON s.id = iw.score_id
      LEFT JOIN players p ON p.id = s.player_id
      WHERE iw.event_id = p_event_id
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_wins(uuid, text)
  TO anon, authenticated;


-- ── 5. record_fallback_win ───────────────────────────────────
-- Schreibt einen frontend-generierten Fallback-Code in die DB.
-- Wird aufgerufen wenn is_instant_win=false vom Server zurückkam, aber
-- das Frontend einen Instant-Win getriggert und einen lokalen Code generiert hat.
-- Verhindert "Zombie-Codes" die Staff nicht verifizieren kann.
--
-- Gibt true zurück wenn erfolgreich eingetragen,
-- false wenn der Code für dieses Event bereits existiert (Duplikat).
CREATE OR REPLACE FUNCTION public.record_fallback_win(
  p_event_id   uuid,
  p_player_id  uuid,
  p_score_id   uuid,
  p_claim_code text,
  p_staff_pin  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- ── PIN prüfen ──────────────────────────────────────────────
  IF p_staff_pin <> '1234' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  -- ── Duplikat-Schutz ─────────────────────────────────────────
  SELECT EXISTS(
    SELECT 1 FROM instant_wins
     WHERE claim_code = p_claim_code
       AND event_id   = p_event_id
  ) INTO v_exists;

  IF v_exists THEN
    RETURN false;  -- Code für dieses Event bereits vorhanden
  END IF;

  -- ── Fallback-Gewinn eintragen ───────────────────────────────
  INSERT INTO instant_wins (event_id, score_id, claim_code)
  VALUES (p_event_id, p_score_id, p_claim_code);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_fallback_win(uuid, uuid, uuid, text, text)
  TO anon, authenticated;
`;

// ══════════════════════════════════════════════════════════════
// E: CSV / EXCEL EXPORT
// ══════════════════════════════════════════════════════════════
function exportEventCSV(eventId, eventName, btn) {
  if (!eventId) {
    showToast('Kein aktives Event für Export.', true);
    return;
  }
  var origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled    = true;
    btn.textContent = '⏳ Wird erstellt…';
  }

  Promise.all([
    supaFetch('/rest/v1/players?event_id=eq.' + encodeURIComponent(eventId) +
              '&select=*&order=created_at.asc'),
    supaFetch('/rest/v1/scores?event_id=eq.'  + encodeURIComponent(eventId) +
              '&select=*&order=score.desc'),
    supaFetch('/rest/v1/instant_wins?event_id=eq.' + encodeURIComponent(eventId) +
              '&select=*'),
  ]).then(function (results) {
    var players = results[0] || [];
    var scores  = results[1] || [];
    var wins    = results[2] || [];

    // Best score per player (highest score row)
    var bestScores = {};
    scores.forEach(function (s) {
      if (!s.player_id) return;
      if (!bestScores[s.player_id] || s.score > bestScores[s.player_id].score) {
        bestScores[s.player_id] = s;
      }
    });

    // Win per player (via score_id → player_id link)
    var scoreMap = {};
    scores.forEach(function (s) { scoreMap[s.id] = s; });
    var winByPlayer = {};
    wins.forEach(function (w) {
      var sc = scoreMap[w.score_id];
      if (sc && sc.player_id && !winByPlayer[sc.player_id]) {
        winByPlayer[sc.player_id] = w;
      }
    });

    // CSV header row (German, semicolon-separated)
    var headers = [
      'Vorname', 'Nachname', 'Email', 'Telefon', 'PLZ', 'Ort',
      'Kontakt-Wunsch', 'Wunschmodell',
      'Newsletter-Einw.', 'Angebote-Einw.', 'Partner-Einw.', 'TNB akzeptiert',
      'Bester Score', 'Level erreicht', 'Ghost überholt', 'Spieldauer (Sek)',
      'Instant-Win', 'Gewinn-Code', 'Code eingelöst am', 'Eingelöst von Staff',
      'Eintrag-Zeitstempel', 'Quelle',
    ];

    function csvCell(v) {
      var s = (v === null || v === undefined) ? '' : String(v);
      if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    function fmtDate(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    }

    var rows = [headers.map(csvCell).join(';')];

    players.forEach(function (p) {
      var bs  = bestScores[p.id] || {};
      var win = winByPlayer[p.id] || {};
      var row = [
        p.first_name           || '',
        p.last_name            || '',
        p.email                || '',
        p.phone                || '',
        p.zip                  || '',
        p.city                 || '',
        p.contact_intent       || '',
        p.vehicle_interest     || '',
        p.consent_stay         ? 'Ja' : 'Nein',
        p.consent_offers       ? 'Ja' : 'Nein',
        p.consent_partners     ? 'Ja' : 'Nein',
        p.terms_accepted       ? 'Ja' : 'Nein',
        bs.score               !== undefined ? bs.score           : '',
        bs.level_reached       !== undefined ? bs.level_reached   : '',
        bs.ghost_overtaken     === true  ? 'Ja'
          : bs.ghost_overtaken === false ? 'Nein' : '',
        bs.play_duration_s     !== undefined ? bs.play_duration_s : '',
        win.claim_code ? 'Ja' : 'Nein',
        win.claim_code         || '',
        fmtDate(win.claimed_at),
        win.claimed_by_staff   || '',
        fmtDate(p.created_at),
        p.entry_source         || '',
      ].map(csvCell);
      rows.push(row.join(';'));
    });

    var csv  = '\uFEFF' + rows.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var now  = new Date().toISOString().slice(0, 10);
    var safeName = (eventName || 'Event').replace(/[^a-zA-Z0-9_\-\u00C0-\u024F]/g, '_');
    var filename = 'LeapCharge_' + safeName + '_' + now + '.csv';

    var a = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    if (btn) {
      btn.textContent = '✅ Heruntergeladen';
      setTimeout(function () {
        btn.disabled    = false;
        btn.textContent = origText;
      }, 3000);
    }
    showToast('✅ CSV für ' + (players.length) + ' Spieler erstellt.');
  }).catch(function (err) {
    showToast('⚠️ Export fehlgeschlagen: ' + err.message, true);
    if (btn) {
      btn.disabled    = false;
      btn.textContent = origText;
    }
  });
}

// ══════════════════════════════════════════════════════════════
// F: DB-SETUP HELPER
// ══════════════════════════════════════════════════════════════
var dbSetupVisible = false;

function toggleDbSetup() {
  var sec = document.getElementById('db-setup-section');
  if (!sec) return;
  dbSetupVisible = !dbSetupVisible;
  sec.style.display = dbSetupVisible ? 'block' : 'none';
  if (dbSetupVisible) {
    loadDbSetup();
    setTimeout(function () {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
}

function loadDbSetup() {
  var cont = document.getElementById('db-setup-content');
  if (!cont) return;
  cont.innerHTML = '<div class="msg-loading">⏳ Prüfe Migrations-Status…</div>';

  // Check whether migration 04 (difficulty columns) is applied
  // If the column does not exist, Supabase returns 400 with PGRST error.
  var mig04Status = supaFetch('/rest/v1/events?select=difficulty&limit=1')
    .then(function () { return true;  })
    .catch(function () { return false; });

  mig04Status.then(function (ok) {
    var statusBadge = ok
      ? '<span class="mig-badge mig-ok">✅ Migration 04 aktiv</span>'
      : '<span class="mig-badge mig-warn">⚠️ Migration 04 ausstehend</span>';

    cont.innerHTML =
      '<div class="mig-row">' + statusBadge + '</div>' +
      '<details class="sql-details">' +
        '<summary>📄 04_difficulty.sql anzeigen / kopieren</summary>' +
        '<div class="sql-block-wrap">' +
          '<pre class="sql-pre" id="sql-pre-04"></pre>' +
          '<button class="btn-copy" onclick="copyToClipboard(MIGRATION_04_SQL, this)">📋 Kopieren</button>' +
        '</div>' +
      '</details>' +
      '<details class="sql-details">' +
        '<summary>📄 06_staff_rpc.sql anzeigen / kopieren</summary>' +
        '<div class="sql-block-wrap">' +
          '<pre class="sql-pre" id="sql-pre-06"></pre>' +
          '<button class="btn-copy" onclick="copyToClipboard(MIGRATION_06_SQL, this)">📋 Kopieren</button>' +
        '</div>' +
      '</details>';

    // Set SQL text via textContent (safe, no XSS)
    var pre04 = document.getElementById('sql-pre-04');
    var pre06 = document.getElementById('sql-pre-06');
    if (pre04) pre04.textContent = MIGRATION_04_SQL;
    if (pre06) pre06.textContent = MIGRATION_06_SQL;
  });
}

function copyToClipboard(text, btn) {
  var origText = btn ? btn.textContent : '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      if (btn) { btn.textContent = '✅ Kopiert!'; }
      setTimeout(function () { if (btn) btn.textContent = origText; }, 2000);
    }).catch(function () {
      _clipboardFallback(text, btn, origText);
    });
  } else {
    _clipboardFallback(text, btn, origText);
  }
}

function _clipboardFallback(text, btn, origText) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (btn) { btn.textContent = '✅ Kopiert!'; }
    setTimeout(function () { if (btn) btn.textContent = origText; }, 2000);
  } catch (e) {
    showToast('⚠️ Kopieren nicht möglich.', true);
  }
  document.body.removeChild(ta);
}
