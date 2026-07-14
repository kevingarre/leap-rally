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
var currentEventId = null;
var lockoutTimer   = null;
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
    currentEventId = ev.id;
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
