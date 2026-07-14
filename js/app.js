/* ═══════════════════════════════════════════════════════════
   LEAP CHARGE – Breakout Edition  v20260714j
   Leapmotor × Tischtennis × E-Mobility
   Mobile-first · No build step · No backend
═══════════════════════════════════════════════════════════ */

'use strict';

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const MAX_LIVES          = 3;
const MAX_ENERGY         = 100;
const FULL_CHARGE_BONUS_SCORE = 400;
const CAR_TARGET_BONUS_SCORE  = 140;
const CAR_TARGET_BONUS_ENERGY = 3;

// ── Per-model vehicle bonuses (score awarded on car-block hit) ─────────────────
// Adjust these values here; displayed in float-text after each hit.
const VEHICLE_BONUS = {
  t03: { score: 100, label: 'T03'          },
  b05: { score: 150, label: 'B05 TURBO'    },
  b10: { score: 200, label: 'B10'          },
  c10: { score: 300, label: 'C10 JACKPOT!' },
};

// Block grid
const BLOCK_GAP      = 5;   // px between blocks
const BLOCK_TOP_PAD  = 18;  // px from top of canvas
const BLOCK_SIDE_PAD = 8;   // px from sides

// Energy reward per block row (row 0 = top; row N-1 = nearest paddle = highest reward)
const BLOCK_ROW_ENERGY_BASE = [2, 3, 4, 5];
const BLOCK_COLORS = [
  '#67C23A', // leap-green  – row 0 (top)
  '#95D475', // leap-green-soft – row 1
  '#FFB800', // amber  – row 2
  '#FFFFFF', // white – row 3 (bottom of block zone)
];
const TURBO_BLOCK_COLOR = '#67C23A';
const CAR_BLOCK_COLOR   = '#95D475';

// Ball physics (fractions of canvas height per second)
const BALL_BASE_SPEED  = 0.50;  // raised from 0.38 (+32%) — spuerbar schneller ab Level 1
const BALL_MAX_SPEED   = 1.40;  // raised from 1.15 — cap fuer Level 4 + Bonus, kein Tunneling-Risiko
const BALL_WAVE_ACCEL  = 1.06;
const BALL_MIN_VY_FRAC = 0.30;

// ═══════════════════════════════════════════════════════════
// DIFFICULTY PRESETS + GAME CONFIG RESOLVER
// ═══════════════════════════════════════════════════════════
// Three difficulty tiers. Staff can switch live via the DB:
//   UPDATE events SET difficulty='hard' WHERE is_active=true;
// Individual cfg_* columns override any preset value when NOT NULL.
//
// Preset values summary:
//   easy  : ballBase=0.40, ballMax=1.15, lives=5, extraBall from L1, instantWin=1000
//   normal: ballBase=0.50, ballMax=1.40, lives=3, extraBall from L1, instantWin=1500
//   hard  : ballBase=0.62, ballMax=1.70, lives=2, extraBall from L3, instantWin=2200
const DIFFICULTY_PRESETS = {
  easy: {
    ballBaseSpeed:     0.40,
    ballMaxSpeed:      1.15,
    lives:             5,
    instantWinScore:   1000,
    extraBallEnabled:  true,
    extraBallMinLevel: 1,
  },
  normal: {
    ballBaseSpeed:     BALL_BASE_SPEED,  // 0.50
    ballMaxSpeed:      BALL_MAX_SPEED,   // 1.40
    lives:             MAX_LIVES,        // 3
    instantWinScore:   1500,
    extraBallEnabled:  true,
    extraBallMinLevel: 1,
  },
  hard: {
    ballBaseSpeed:     0.62,
    ballMaxSpeed:      1.70,
    lives:             2,
    instantWinScore:   2200,
    extraBallEnabled:  true,
    extraBallMinLevel: 3,
  },
};

// Active resolved config — populated by resolveGameConfig() before each game.
let GAME_CFG = Object.assign({}, DIFFICULTY_PRESETS.normal);

/**
 * Resolve GAME_CFG from window.LEAP_EVENT.
 * — Falls back to 'normal' preset when LEAP_EVENT is null or difficulty unknown.
 * — Each cfg_* field from the DB overrides the preset when not null/undefined.
 * — cfg_instant_win_score has priority over legacy instant_win_score.
 * Call this once before beginGameLoop (inside initCanvas flow).
 */
function resolveGameConfig() {
  const ev      = window.LEAP_EVENT;
  const tier    = (ev && DIFFICULTY_PRESETS[ev.difficulty]) ? ev.difficulty : 'normal';
  const preset  = DIFFICULTY_PRESETS[tier];

  GAME_CFG = {
    ballBaseSpeed:     (ev && ev.cfg_ball_base_speed     != null) ? ev.cfg_ball_base_speed     : preset.ballBaseSpeed,
    ballMaxSpeed:      (ev && ev.cfg_ball_max_speed      != null) ? ev.cfg_ball_max_speed      : preset.ballMaxSpeed,
    lives:             (ev && ev.cfg_lives               != null) ? ev.cfg_lives               : preset.lives,
    // cfg_instant_win_score > legacy instant_win_score > preset
    instantWinScore:   (ev && ev.cfg_instant_win_score   != null) ? ev.cfg_instant_win_score
                     : (ev && ev.instant_win_score       != null) ? ev.instant_win_score
                     : preset.instantWinScore,
    extraBallEnabled:  (ev && ev.cfg_extra_ball_enabled  != null) ? ev.cfg_extra_ball_enabled  : preset.extraBallEnabled,
    extraBallMinLevel: (ev && ev.cfg_extra_ball_min_level != null) ? ev.cfg_extra_ball_min_level : preset.extraBallMinLevel,
  };

  console.info('[LEAP] GAME_CFG resolved (tier=' + tier + '):', JSON.stringify(GAME_CFG));
}

// Level speed multipliers
const LEVEL_SPEED_MULT = [1.0, 1.25, 1.56, 1.95];

// Paddle widths per level (fraction of canvas width)
const LEVEL_PADDLE_FRAC = [0.32, 0.27, 0.23, 0.20];
const PADDLE_MIN_PX     = 45;
const PADDLE_HEIGHT     = 12;
const PADDLE_BOTTOM_PAD = 18;
const PADDLE_LERP_FACTOR = 18;

// Level block layout: [rows, cols, turboCount, carBlockRows]
const LEVEL_BLOCK_CONFIG = [
  { rows: 2, cols: 5, turboCount: 0, carRows: [1] },
  { rows: 3, cols: 6, turboCount: 2, carRows: [1, 2] },
  { rows: 4, cols: 6, turboCount: 3, carRows: [1, 2, 3] },
  { rows: 4, cols: 7, turboCount: 4, carRows: [2, 3] },
];

// Ghost car speed per level
const GHOST_SPEED_FRAC = [0.02, 0.035, 0.055, 0.08];

// Bonus level (after Level 4 cleared): escalating difficulty
const BONUS_LEVEL_SPEED_MULT = 1.08; // per bonus wave
const BONUS_LEVEL_MAX_SPEED_MULT = 3.0;

// Multi-ball duration (Level 4)
const MULTIBALL_DURATION = 3.0;

// FX
const PARTICLE_COUNT = 8;

// Level overlay
const LEVEL_OVERLAY_DURATION = 1.8;

// ═══════════════════════════════════════════════════════════
// BACKEND / SESSION STATE
// ═══════════════════════════════════════════════════════════
let session = {
  gameStartTs:    null,
  pendingScore:   null,
  scoreId:        null,
  playerId:       null,
  instantWinCode: null,
  submitted:      false,
};

function resetSession() {
  session.gameStartTs    = null;
  session.pendingScore   = null;
  session.scoreId        = null;
  session.playerId       = null;
  session.instantWinCode = null;
  session.submitted      = false;
}

// ═══════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════
let state = {
  currentScreen:   'screen-start',
  gameActive:      false,
  hits:            0,
  energy:          0,
  combo:           1,
  maxCombo:        1,
  score:           0,
  wavesCleared:    0,
  carTargetsHit:   0,
  fullChargeBonuses: 0,
  fullChargeRewarded: false,
  rafId:           null,
  lastFrameTime:   0,
  ballSpeedPx:     0,
  // Life system
  lives:           MAX_LIVES,
  // Level system (1–4, then bonus)
  level:           1,
  maxLevelReached: 1,
  bonusMode:       false,  // true after Level 4 cleared
  bonusWave:       0,      // bonus wave counter
  // Ghost car
  ghostOvertaken:  false,
  ghostTrackPos:   0.65,
  // Instant-win
  instantWinTriggered: false,  // only once per game
  instantWinPending:   false,  // player chose to keep playing after instant-win
  gamepaused:      false,
  // Multi-ball (Level 4)
  multiBallActive: false,
  multiBallTimer:  0,
  // Vehicle Power-Ups
  pierceActive:    false,
  speedBoostTimer: 0,
  paddleBoostTimer: 0,
  paddleBaseW:     0,
};

// ═══════════════════════════════════════════════════════════
// CANVAS & GAME OBJECTS
// ═══════════════════════════════════════════════════════════
let canvas, ctx;
let cw = 0, ch = 0;

const paddle = { x: 0, y: 0, w: 0, h: PADDLE_HEIGHT, targetX: 0 };
const ball   = { x: 0, y: 0, vx: 0, vy: 0, r: 0 };
const ball2  = { x: 0, y: 0, vx: 0, vy: 0, r: 0, active: false };

let blocks      = [];
let particles   = [];
let floatTexts  = [];

let ballLaunched  = false;
let ballMissFlash = 0;
let newWaveFlash  = 0;
let hintAlpha     = 1;

let levelOverlay     = { active: false, timer: 0, level: 1, label: '' };
let screenShakeTimer = 0;
let screenShakeAmt   = 0;

let audioCtx = null;

// ═══════════════════════════════════════════════════════════
// SOUND STATE
// ═══════════════════════════════════════════════════════════
let soundEnabled = (function() {
  const stored = localStorage.getItem('leap_sound_on');
  return stored === null ? true : stored === 'true';
})();

function setSoundEnabled(val) {
  soundEnabled = val;
  localStorage.setItem('leap_sound_on', String(val));
  syncSoundButtons();
  if (!val) {
    stopBgMusic();
  } else if (state.gameActive && !state.gamepaused) {
    startBgMusic();
  }
}

function toggleSound() {
  setSoundEnabled(!soundEnabled);
}

function syncSoundButtons() {
  const icon = soundEnabled ? '🔊' : '🔇';
  document.querySelectorAll('.sound-toggle-btn').forEach(function(btn) {
    btn.textContent = icon;
    btn.setAttribute('aria-label', soundEnabled ? 'Sound aus' : 'Sound an');
    btn.classList.toggle('sound-off', !soundEnabled);
  });
}

// ═══════════════════════════════════════════════════════════
// BACKGROUND MUSIC (WebAudio synth loop)
// ═══════════════════════════════════════════════════════════
let bgMusicNodes = null;   // { osc, gain, lfo } when active
let bgMusicActive = false;

const BG_NOTE_SEQ = [55, 55, 82.41, 55, 73.42, 55, 65.41, 55]; // A1 arpeggio
const BG_BEAT_S  = 0.22;  // seconds per step
const BG_GAIN    = 0.07;  // master gain (very quiet)

function startBgMusic() {
  if (bgMusicActive || !soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  // Do not call ac.resume() here — caller (runCountdown) already awaited it.
  // Read currentTime after resume so notes are not scheduled in the past.
  bgMusicActive = true;
  try {
    scheduleBgMusicLoop(ac, ac.currentTime);
  } catch(e) {}
}

function stopBgMusic() {
  bgMusicActive = false;
  if (bgMusicNodes) {
    try { bgMusicNodes.gain.gain.setTargetAtTime(0, bgMusicNodes.ac.currentTime, 0.1); } catch(e) {}
    bgMusicNodes = null;
  }
}

function scheduleBgMusicLoop(ac, startAt) {
  if (!bgMusicActive || !soundEnabled) return;
  // Clamp startAt so we never schedule notes in the past (e.g. immediately
  // after a just-resumed AudioContext whose currentTime just jumped forward).
  startAt = Math.max(startAt, ac.currentTime + 0.05);
  const seq = BG_NOTE_SEQ;
  const loopDur = seq.length * BG_BEAT_S;

  for (let i = 0; i < seq.length; i++) {
    const t    = startAt + i * BG_BEAT_S;
    const freq = seq[i];

    try {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      const master = ac.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(BG_GAIN, t + 0.02);
      env.gain.setValueAtTime(BG_GAIN, t + BG_BEAT_S * 0.55);
      env.gain.linearRampToValueAtTime(0, t + BG_BEAT_S * 0.9);

      osc.connect(env);
      env.connect(ac.destination);
      osc.start(t);
      osc.stop(t + BG_BEAT_S);
    } catch(e) {}
  }

  // Schedule next loop
  const nextStart = startAt + loopDur;
  const delayMs   = Math.max(0, (nextStart - ac.currentTime - 0.2) * 1000);
  setTimeout(function() {
    if (bgMusicActive && soundEnabled) scheduleBgMusicLoop(ac, nextStart);
  }, delayMs);
}

// ═══════════════════════════════════════════════════════════
// SCREEN NAVIGATION
// ═══════════════════════════════════════════════════════════
function showScreen(id) {
  const current = document.querySelector('.screen.active');
  const next    = document.getElementById(id);
  if (!next || current?.id === id) return;
  if (current) {
    current.classList.remove('active');
    current.classList.add('exit-left');
    setTimeout(() => current.classList.remove('exit-left'), 400);
  }
  requestAnimationFrame(() => next.classList.add('active'));
  state.currentScreen = id;
}

// ═══════════════════════════════════════════════════════════
// GAME INITIALIZATION
// ═══════════════════════════════════════════════════════════
function startGame() {
  // Ensure AudioContext is created and resumed synchronously inside this
  // user-gesture handler — iOS Safari requires this in the same call stack.
  ensureAudioResumed();
  resetGameState();
  showScreen('screen-game');
  runCountdown();
}

function resetGameState() {
  cancelAnimationFrame(state.rafId);
  stopBgMusic();
  resetSession();

  Object.assign(state, {
    gameActive:       false,
    hits:             0,
    energy:           0,
    combo:            1,
    maxCombo:         1,
    score:            0,
    wavesCleared:     0,
    carTargetsHit:    0,
    fullChargeBonuses: 0,
    fullChargeRewarded: false,
    rafId:            null,
    lastFrameTime:    0,
    ballSpeedPx:      0,
    lives:            GAME_CFG.lives,
    level:            1,
    maxLevelReached:  1,
    bonusMode:        false,
    bonusWave:        0,
    ghostOvertaken:   false,
    ghostTrackPos:    0.65,
    instantWinTriggered: false,
    instantWinPending:   false,
    gamepaused:       false,
    multiBallActive:  false,
    multiBallTimer:   0,
    pierceActive:     false,
    speedBoostTimer:  0,
    paddleBoostTimer: 0,
    paddleBaseW:      0,
  });

  ball2.active = false;
  particles    = [];
  floatTexts   = [];
  ballLaunched  = false;
  ballMissFlash = 0;
  newWaveFlash  = 0;
  hintAlpha     = 1;
  levelOverlay  = { active: false, timer: 0, level: 1, label: '' };
  screenShakeTimer = 0;
  screenShakeAmt   = 0;
  // Overtake drama reset
  slowMoActive  = false;
  slowMoTimer   = 0;
  overtakeFlash = 0;

  // Reset HUD
  setEl('hit-count',   '0');
  setEl('combo-value', '×1');
  setEl('battery-pct', '0%');
  updateLivesHUD();
  updateLevelHUD();

  const fill = document.getElementById('battery-fill');
  if (fill) { fill.style.width = '0%'; fill.classList.remove('full'); }

  const spark = document.getElementById('spark-line');
  if (spark) spark.classList.remove('active');

  const boostOverlay = document.getElementById('boost-overlay');
  if (boostOverlay) boostOverlay.classList.remove('show');

  const ghostEl = document.getElementById('ghost-car');
  if (ghostEl) {
    ghostEl.classList.remove('ghost-overtaken', 'ghost-reset');
    ghostEl.style.left = '65%';
  }

  const gameCarEl = document.getElementById('game-car');
  if (gameCarEl) gameCarEl.classList.remove('boost-mode');

  const comboEl = document.getElementById('combo-value');
  if (comboEl) comboEl.className = 'hud-value combo-val';

  const carProgress = document.getElementById('car-progress');
  if (carProgress) carProgress.style.left = '8px';

  const numEl = document.getElementById('countdown-num');
  if (numEl) {
    numEl.textContent  = '3';
    numEl.style.color  = '#FF4D51';
    numEl.style.filter = 'drop-shadow(0 0 30px #FF4D51)';
    numEl.classList.remove('countdown-go');
  }

  // Hide instant-win overlay if visible
  const iwOverlay = document.getElementById('instant-win-overlay');
  if (iwOverlay) iwOverlay.classList.add('hidden');
}

function runCountdown() {
  const overlay  = document.getElementById('countdown-overlay');
  const numEl    = document.getElementById('countdown-num');
  const textEl   = document.getElementById('countdown-text');
  const lights   = [0, 1, 2].map(function(n) { return document.getElementById('cld-' + n); });
  const countArr = ['3', '2', '1', 'GO!'];
  // Traffic-light classes: step 0='3'→red, 1='2'→amber, 2='1'→green
  const lightClasses = ['active-red', 'active-amber', 'active-green'];
  let   i        = 0;

  // Helper: update traffic lights for step index (0-based)
  function updateLights(step) {
    lights.forEach(function(el, idx) {
      if (!el) return;
      el.className = 'countdown-light';
      if (idx <= step && step < 3) el.classList.add(lightClasses[idx]);
    });
  }

  overlay.classList.remove('hidden');
  numEl.textContent  = countArr[0];
  numEl.style.color  = '#FF4D51';
  numEl.style.filter = 'drop-shadow(0 0 30px #FF4D51)';
  numEl.classList.remove('countdown-go');
  if (textEl) textEl.textContent = 'ACHTUNG…';
  updateLights(0);

  // AudioContext was already resumed synchronously in startGame() (user gesture).
  // Safe to schedule audio immediately on all browsers incl. iOS Safari.
  startBgMusic();
  playCountdownBlip(0);

  const tick = setInterval(function() {
    i++;
    if (i >= countArr.length) {
      clearInterval(tick);
      overlay.classList.add('hidden');
      initCanvas();
      beginGameLoop();
    } else {
      // Restart the pop animation
      numEl.style.animation = 'none';
      void numEl.offsetHeight;
      numEl.style.animation  = '';
      numEl.textContent      = countArr[i];

      if (i === countArr.length - 1) {
        // GO! — Leapmotor green, big glow
        numEl.style.color  = '#67C23A';
        numEl.style.filter = 'drop-shadow(0 0 40px #67C23A) drop-shadow(0 0 80px #67C23A)';
        numEl.classList.add('countdown-go');
        if (textEl) textEl.textContent = '🏁 LOS!';
        // Light all three green on GO
        lights.forEach(function(el, idx) {
          if (!el) return;
          el.className = 'countdown-light active-green';
        });
      } else {
        // 3, 2, 1 — traffic-light progression
        const trafficColors = ['#FF4D51', '#FFB800', '#67C23A'];
        numEl.style.color  = trafficColors[i];
        numEl.style.filter = 'drop-shadow(0 0 30px ' + trafficColors[i] + ')';
        numEl.classList.remove('countdown-go');
        if (textEl) textEl.textContent = i === 2 ? 'BEREIT!' : 'ACHTUNG…';
        updateLights(i);
      }

      // Play blip for this step
      playCountdownBlip(i);
    }
  }, 900);
}

// ═══════════════════════════════════════════════════════════
// CANVAS SETUP
// ═══════════════════════════════════════════════════════════
function initCanvas() {
  canvas = document.getElementById('game-canvas');
  if (!canvas) { console.error('game-canvas not found'); return; }
  ctx    = canvas.getContext('2d');

  resizeCanvas();

  canvas.addEventListener('touchstart',  onTouchInput,   { passive: false });
  canvas.addEventListener('touchmove',   onTouchInput,   { passive: false });
  canvas.addEventListener('pointermove', onPointerInput);
  canvas.addEventListener('pointerdown', onPointerInput);
  canvas.addEventListener('pointerdown', onLaunchInput);

  // Resolve difficulty config from current event (or 'normal' preset as fallback)
  resolveGameConfig();

  state.ballSpeedPx = GAME_CFG.ballBaseSpeed * ch * LEVEL_SPEED_MULT[0];
  initPaddle();
  initBallObj();
  initBlocks();
}

function resizeCanvas() {
  cw = canvas.clientWidth  || window.innerWidth;
  ch = canvas.clientHeight || Math.max(200, window.innerHeight - 200);
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  ctx.scale(dpr, dpr);
}

function initPaddle() {
  const lvlIdx = Math.max(0, Math.min(3, state.level - 1));
  const frac   = LEVEL_PADDLE_FRAC[lvlIdx];
  const rawW   = Math.round(cw * frac);
  paddle.w       = Math.max(PADDLE_MIN_PX, rawW);
  paddle.h       = PADDLE_HEIGHT;
  paddle.x       = (cw - paddle.w) / 2;
  paddle.y       = ch - PADDLE_BOTTOM_PAD - PADDLE_HEIGHT;
  paddle.targetX = paddle.x;
}

function initBallObj() {
  ball.r = Math.max(8, Math.round(cw * 0.032));
  resetBallToPaddle();
}

// Sauber Ball auf Paddle zurücksetzen (Level-Up Bug-Fix)
function resetBallToPaddle() {
  ball.x  = paddle.x + paddle.w / 2;
  ball.y  = paddle.y - ball.r - 4;
  ball.vx = 0;
  ball.vy = 0;
  ballLaunched = false;
}

function launchBall() {
  const angleDeg = -80 + Math.random() * 20;
  const angleRad = angleDeg * (Math.PI / 180);
  const dir      = Math.random() > 0.5 ? 1 : -1;
  const spd      = state.ballSpeedPx;
  ball.vx = Math.cos(angleRad) * spd * dir;
  ball.vy = Math.sin(angleRad) * spd;
  ballLaunched = true;
}

// ═══════════════════════════════════════════════════════════
// LEVEL SYSTEM
// ═══════════════════════════════════════════════════════════
function getLevelConfig() {
  return LEVEL_BLOCK_CONFIG[Math.min(state.level - 1, 3)];
}

function tryLevelUp() {
  // Levels count up indefinitely (5, 6, 7, ...). No more "bonus wave" mode.
  state.level++;
  if (state.level > state.maxLevelReached) state.maxLevelReached = state.level;

  // Layout/paddle index clamps at 3 (Level 4 = hardest layout); Level 5+ reuse it.
  const lvlIdx = Math.min(state.level - 1, 3);

  if (state.level <= 4) {
    // Standard per-level speed table.
    state.ballSpeedPx = Math.min(
      GAME_CFG.ballBaseSpeed * ch * LEVEL_SPEED_MULT[lvlIdx],
      GAME_CFG.ballMaxSpeed * ch
    );
  } else {
    // Level 5+: keep accelerating beyond the table, clamped to the cap.
    const extra = Math.pow(BONUS_LEVEL_SPEED_MULT, state.level - 4);
    state.ballSpeedPx = Math.min(
      GAME_CFG.ballBaseSpeed * ch * LEVEL_SPEED_MULT[3] * extra,
      GAME_CFG.ballMaxSpeed * ch
    );
  }

  // Update paddle width, keep horizontally centred (index clamped for L5+)
  const frac = LEVEL_PADDLE_FRAC[lvlIdx];
  const newW = Math.max(PADDLE_MIN_PX, Math.round(cw * frac));
  paddle.x   = paddle.x + paddle.w / 2 - newW / 2;
  paddle.w   = newW;
  paddle.x   = Math.max(0, Math.min(cw - paddle.w, paddle.x));
  paddle.targetX = paddle.x;

  // Reset ball cleanly to paddle. NO auto-launch — the player must tap/click
  // to start the ball (Kevin: never auto-start a new level or after a life loss).
  resetBallToPaddle();
  deactivateBall2();
  hintAlpha = 1;  // show "tap to launch" hint again

  levelOverlay = { active: true, timer: LEVEL_OVERLAY_DURATION, level: state.level, label: getLevelLabel(state.level) };

  triggerScreenShake(8, 0.45);
  playLevelUpTone(state.level);
  updateLevelHUD();
  spawnFloatText(cw / 2, ch * 0.35, `⚡ LEVEL ${state.level}!`, '#67C23A');

  if (state.level === 4) {
    spawnFloatText(cw / 2, ch * 0.45, '🔴 MULTI-BALL BEREIT', '#FF4D51');
  } else if (state.level === 5) {
    spawnFloatText(cw / 2, ch * 0.45, 'JAGE DEN HIGHSCORE!', '#FFFFFF');
  }

  // Level 3 reached = Level 2 cleared. Check for instant-win trigger.
  // Don't rely solely on battery-full event — trigger directly here so the
  // player always gets the overtake moment if conditions are met.
  if (state.level === 3 && !state.instantWinTriggered) {
    const overlayMs = Math.round(LEVEL_OVERLAY_DURATION * 1000) + 400;
    setTimeout(function() {
      if (!state.gameActive || state.instantWinTriggered) return;
      if (isInstantWinReady()) triggerGhostOvertake();
    }, overlayMs);
  }

  return true;
}

// Deprecated: bonus-wave mode replaced by continuous level counting.
// Kept as a safe no-op wrapper in case any legacy path still calls it.
function enterBonusMode() {
  tryLevelUp();
}

function getLevelLabel(lvl) {
  const labels = ['', 'WARM-UP', 'CHARGE', 'BOOST', 'OVERTAKE'];
  if (lvl >= 5) return 'OVERTAKE';  // Level 5+ stay at the top tier label
  return labels[Math.min(lvl, 4)] || '';
}

function updateLevelHUD() {
  const badge = document.getElementById('level-badge');
  if (!badge) return;
  badge.textContent = `LVL ${state.level}`;
  badge.className   = `level-badge level-${Math.min(state.level, 4)}`;
}

function updateLivesHUD() {
  const el = document.getElementById('lives-display');
  if (!el) return;
  // Use GAME_CFG.lives as the max hearts count (supports easy=5, normal=3, hard=2)
  const maxHearts = GAME_CFG.lives;
  let html = '';
  for (let i = 0; i < maxHearts; i++) {
    if (i < state.lives) {
      html += '<span class="life-heart life-full">❤️</span>';
    } else {
      html += '<span class="life-heart life-empty">🖤</span>';
    }
  }
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
// BLOCKS
// ═══════════════════════════════════════════════════════════
function initBlocks() {
  blocks = [];
  const cfg     = getLevelConfig();
  const rows    = cfg.rows;
  const cols    = cfg.cols;
  const usableW = cw - BLOCK_SIDE_PAD * 2;
  const blockW  = (usableW - BLOCK_GAP * (cols - 1)) / cols;
  const blockH  = Math.max(14, Math.round(ch * 0.055));

  const totalBlocks  = rows * cols;
  const turboIndices = new Set();
  while (turboIndices.size < Math.min(cfg.turboCount, totalBlocks)) {
    turboIndices.add(Math.floor(Math.random() * totalBlocks));
  }

  let idx      = 0;
  let carCount = 0;  // track car block index for sprite rotation
  for (let row = 0; row < rows; row++) {
    const isCarRow = cfg.carRows.includes(row);
    const carCol   = (row * 2 + 1) % cols;
    for (let col = 0; col < cols; col++) {
      const isTurbo    = turboIndices.has(idx);
      const isCar      = isCarRow && col === carCol;
      const hitsLeft   = (isCar && state.level >= 3) ? 2 : 1;
      const vehicleKey = isCar ? VEHICLE_KEYS[carCount % VEHICLE_KEYS.length] : null;
      if (isCar) carCount++;
      blocks.push({
        x:          BLOCK_SIDE_PAD + col * (blockW + BLOCK_GAP),
        y:          BLOCK_TOP_PAD  + row * (blockH + BLOCK_GAP),
        w:          blockW,
        h:          blockH,
        row,
        alive:      true,
        carTarget:  isCar,
        isTurbo,
        hitsLeft,
        vehicleKey,
      });
      idx++;
    }
  }
}

function respawnBlocks() {
  state.wavesCleared++;

  // Wave-level speed bump
  state.ballSpeedPx = Math.min(
    state.ballSpeedPx * BALL_WAVE_ACCEL,
    GAME_CFG.ballMaxSpeed * ch
  );

  newWaveFlash = 0.8;

  // Always advance the level counter (Levels count up 1,2,3,4,5,...).
  tryLevelUp();

  initBlocks();
  spawnFloatText(cw / 2, ch / 2, `⚡ LEVEL ${state.level}!`, '#67C23A');
}

// ═══════════════════════════════════════════════════════════
// MULTI-BALL
// ═══════════════════════════════════════════════════════════
function spawnBall2() {
  if (ball2.active) return;
  ball2.r      = ball.r;
  ball2.x      = paddle.x + paddle.w / 2;
  ball2.y      = paddle.y - ball2.r - 4;
  ball2.active = true;

  const angleDeg = -75 + Math.random() * 15;
  const angleRad = angleDeg * (Math.PI / 180);
  const dir      = ball.vx < 0 ? 1 : -1;
  const spd      = state.ballSpeedPx;
  ball2.vx = Math.cos(angleRad) * spd * dir;
  ball2.vy = Math.sin(angleRad) * spd;

  state.multiBallActive = true;
  state.multiBallTimer  = MULTIBALL_DURATION;

  // Float text only for Level 4+ (flashFullCharge already shows its own cue)
  if (state.level >= 4) {
    spawnFloatText(cw / 2, ch * 0.3, '🔴 MULTI-BALL!', '#FF4D51');
  }
  playTone(660, 'square', 0.18, 0.25);
  triggerScreenShake(5, 0.3);
}

function deactivateBall2() {
  ball2.active = false;
  state.multiBallActive = false;
  state.multiBallTimer  = 0;
}

// ═══════════════════════════════════════════════════════════
// GHOST CAR
// ═══════════════════════════════════════════════════════════
function updateGhostCar(dt) {
  if (state.ghostOvertaken) return;
  const lvlIdx = Math.min(state.level - 1, 3);
  const spd    = GHOST_SPEED_FRAC[lvlIdx];
  state.ghostTrackPos = Math.min(0.97, state.ghostTrackPos + spd * dt);

  const ghostEl = document.getElementById('ghost-car');
  const track   = document.querySelector('.car-track');
  if (!ghostEl || !track) return;
  const trackW    = track.offsetWidth;
  const playerMax = trackW - 50 - 36;
  ghostEl.style.left = `${8 + state.ghostTrackPos * playerMax}px`;
}

// ═══════════════════════════════════════════════════════════
// WEBAUDIO
// ═══════════════════════════════════════════════════════════
// IMPORTANT: AudioContext must be created AND resumed synchronously inside
// a user-gesture handler on iOS Safari. Do NOT auto-resume here.
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return audioCtx;
}

// Call this synchronously inside a user-gesture (tap/click) handler.
// On iOS Safari, resume() must happen in the same call stack as the gesture.
function ensureAudioResumed() {
  const ac = getAudioCtx();
  if (ac && ac.state !== 'running') {
    ac.resume().catch(function() {});
  }
  return ac;
}

function playTone(freq, type, gain, duration) {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    env.gain.setValueAtTime(gain, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.connect(env);
    env.connect(ac.destination);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration + 0.05);
  } catch(e) {}
}

function playLevelUpTone(level) {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  const notes = [
    [440, 554, 659],
    [523, 659, 784],
    [659, 880, 1047],
  ][Math.min(level - 2, 2)] || [440, 554, 659];

  notes.forEach((freq, i) => {
    const delay = i * 0.10;
    const osc   = ac.createOscillator();
    const env   = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
    env.gain.setValueAtTime(0, ac.currentTime + delay);
    env.gain.linearRampToValueAtTime(0.22, ac.currentTime + delay + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.45);
    osc.connect(env);
    env.connect(ac.destination);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + 0.5);
  });
}

// ═══════════════════════════════════════════════════════════
// SCREEN SHAKE
// ═══════════════════════════════════════════════════════════
function triggerScreenShake(amt, duration) {
  screenShakeAmt   = amt;
  screenShakeTimer = duration;
}

// ═══════════════════════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════════════════════
function beginGameLoop() {
  state.gameActive    = true;
  state.gamepaused    = false;
  state.lastFrameTime = performance.now();
  session.gameStartTs = Date.now();

  // Do NOT auto-launch — ball waits on the paddle until the player taps/clicks.
  resetBallToPaddle();
  hintAlpha = 1;  // show "tap to launch" hint

  // Background music was already started at countdown; only start if not yet active
  // (handles edge case where countdown was skipped or bgMusic stopped somehow)
  if (!bgMusicActive) startBgMusic();

  state.rafId = requestAnimationFrame(gameFrame);
}

function gameFrame(timestamp) {
  if (!state.gameActive || state.gamepaused) return;

  const rawDt = Math.min((timestamp - state.lastFrameTime) / 1000, 0.05);
  state.lastFrameTime = timestamp;

  // Slow-motion during overtake drama
  let dt = rawDt;
  if (slowMoActive) {
    slowMoTimer -= rawDt;
    if (slowMoTimer <= 0) {
      slowMoActive = false;
      slowMoTimer  = 0;
    } else {
      // Ease: start very slow, ramp back to normal over the duration
      const progress = 1 - (slowMoTimer / SLOWMO_DURATION);
      const factor   = SLOWMO_SPEED + (1 - SLOWMO_SPEED) * Math.pow(progress, 2.5);
      dt = rawDt * factor;
    }
  }

  update(dt);
  render();

  state.rafId = requestAnimationFrame(gameFrame);
}

// ═══════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════
function update(dt) {
  const lerp = Math.min(1, PADDLE_LERP_FACTOR * dt);
  paddle.x += (paddle.targetX - paddle.x) * lerp;
  paddle.x  = Math.max(0, Math.min(cw - paddle.w, paddle.x));

  if (!ballLaunched) {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 4;
  } else {
    updateBall(dt);
  }

  if (ball2.active) {
    // Multi-ball stays active until the second ball is actually lost
    // (no timer). deactivateBall2() is called in updateBall2 when it drops out.
    updateBall2(dt);
  }

  updateGhostCar(dt);

  if (levelOverlay.active) {
    levelOverlay.timer -= dt;
    if (levelOverlay.timer <= 0) levelOverlay.active = false;
  }

  if (screenShakeTimer > 0) {
    screenShakeTimer = Math.max(0, screenShakeTimer - dt);
  }

  updateParticles(dt);
  updateFloatTexts(dt);

  if (ballMissFlash  > 0) ballMissFlash  = Math.max(0, ballMissFlash  - dt * 2.5);
  if (newWaveFlash   > 0) newWaveFlash   = Math.max(0, newWaveFlash   - dt * 1.0); // slower fade for overtake flash
  // Keep the hint fully visible while the ball waits on the paddle (tap-to-launch);
  // only fade it out once the ball is in play.
  if (!ballLaunched) {
    hintAlpha = 1;
  } else if (hintAlpha > 0) {
    hintAlpha = Math.max(0, hintAlpha - dt * 0.4);
  }
  if (overtakeFlash  > 0) overtakeFlash  = Math.max(0, overtakeFlash  - dt);

  // ── Vehicle Power-Up timers ──────────────────────────────────────────────
  // B05: Speed Boost — restore speed when timer expires
  if (state.speedBoostTimer > 0) {
    state.speedBoostTimer -= dt;
    if (state.speedBoostTimer <= 0) {
      state.speedBoostTimer = 0;
      const curSpd = Math.hypot(ball.vx, ball.vy);
      if (curSpd > 0) {
        const restoreSpd = curSpd / 1.3;
        ball.vx = ball.vx / curSpd * restoreSpd;
        ball.vy = ball.vy / curSpd * restoreSpd;
      }
      state.ballSpeedPx = Math.max(state.ballSpeedPx / 1.3, GAME_CFG.ballBaseSpeed * ch);
    }
  }

  // B10: Paddle Boost — restore width when timer expires
  if (state.paddleBoostTimer > 0) {
    state.paddleBoostTimer -= dt;
    if (state.paddleBoostTimer <= 0) {
      state.paddleBoostTimer = 0;
      if (state.paddleBaseW > 0) {
        const oldW = paddle.w;
        paddle.w = state.paddleBaseW;
        paddle.x = Math.max(0, Math.min(cw - paddle.w, paddle.x + (oldW - paddle.w) / 2));
        state.paddleBaseW = 0;
      }
    }
  }
}

function updateBall(dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x - ball.r < 0) {
    ball.x  = ball.r;
    ball.vx = Math.abs(ball.vx);
  }
  if (ball.x + ball.r > cw) {
    ball.x  = cw - ball.r;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y - ball.r < 0) {
    ball.y  = ball.r;
    ball.vy = Math.abs(ball.vy);
  }

  if (ball.vy > 0 &&
      ball.y + ball.r >= paddle.y &&
      ball.y + ball.r <= paddle.y + paddle.h + Math.abs(ball.vy * dt * 2) &&
      ball.x > paddle.x - ball.r * 0.4 &&
      ball.x < paddle.x + paddle.w + ball.r * 0.4) {
    doBouncePaddle(ball);
    return;
  }

  if (ball.y - ball.r > ch) {
    onBallMiss();
    return;
  }

  checkBlockCollisions(ball);
}

function updateBall2(dt) {
  if (!ball2.active) return;

  ball2.x += ball2.vx * dt;
  ball2.y += ball2.vy * dt;

  if (ball2.x - ball2.r < 0)  { ball2.x = ball2.r;      ball2.vx = Math.abs(ball2.vx); }
  if (ball2.x + ball2.r > cw) { ball2.x = cw - ball2.r; ball2.vx = -Math.abs(ball2.vx); }
  if (ball2.y - ball2.r < 0)  { ball2.y = ball2.r;      ball2.vy = Math.abs(ball2.vy); }

  if (ball2.vy > 0 &&
      ball2.y + ball2.r >= paddle.y &&
      ball2.y + ball2.r <= paddle.y + paddle.h + Math.abs(ball2.vy * dt * 2) &&
      ball2.x > paddle.x - ball2.r * 0.4 &&
      ball2.x < paddle.x + paddle.w + ball2.r * 0.4) {
    doBouncePaddle(ball2);
    return;
  }

  if (ball2.y - ball2.r > ch) {
    deactivateBall2();
    spawnFloatText(cw / 2, ch * 0.5, 'MULTI-BALL VERLOREN', '#FF2020');
    return;
  }

  checkBlockCollisions(ball2);
}

function doBouncePaddle(b) {
  const hitFrac  = (b.x - paddle.x) / paddle.w;
  const norm     = hitFrac * 2 - 1;
  const maxAngle = 62 * Math.PI / 180;
  const angle    = norm * maxAngle;
  const spd      = Math.sqrt(b.vx * b.vx + b.vy * b.vy);

  b.vx = Math.sin(angle) * spd;
  b.vy = -Math.abs(Math.cos(angle) * spd);

  const minVY = spd * BALL_MIN_VY_FRAC;
  if (Math.abs(b.vy) < minVY) {
    b.vy = -minVY;
    b.vx = Math.sign(b.vx) * Math.sqrt(Math.max(0, spd * spd - minVY * minVY));
  }

  b.y = paddle.y - b.r - 1;

  if (b === ball) {
    // Paddle contact resets the block-streak (STREAK = consecutive block hits).
    state.combo = 1;
    updateComboUI();
    playPaddleBounceTone();
  }

  hintAlpha = 0;
}

function onBallMiss() {
  state.lives--;
  state.combo = 1;
  updateComboUI();
  updateLivesHUD();
  ballMissFlash = 0.5;

  if (state.lives <= 0) {
    // Alle Leben weg → Game Over
    endGame();
    return;
  }

  // Noch Leben übrig → Ball neu auf Paddle. NO auto-launch: player taps to start.
  resetBallToPaddle();
  hintAlpha = 1;  // re-show "tap to launch" hint
  spawnFloatText(cw / 2, ch * 0.5, `❤️ ${state.lives} LEBEN`, '#FF4D51');
}

function checkBlockCollisions(b) {
  let aliveCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    if (!blk.alive) continue;
    aliveCount++;

    const nearX = Math.max(blk.x, Math.min(b.x, blk.x + blk.w));
    const nearY = Math.max(blk.y, Math.min(b.y, blk.y + blk.h));
    const dx    = b.x - nearX;
    const dy    = b.y - nearY;

    if (dx * dx + dy * dy < b.r * b.r) {
      blk.hitsLeft--;

      // T03 Pierce: force-destroy block and skip bounce
      const wasPiercing = (state.pierceActive && b === ball);
      if (wasPiercing) {
        blk.hitsLeft  = 0;
        state.pierceActive = false;
      }

      if (blk.hitsLeft > 0) {
        // Block still alive (first hit of multi-hit block)
        const overlapX = b.r - Math.abs(dx);
        const overlapY = b.r - Math.abs(dy);
        if (overlapX < overlapY) {
          b.vx = -b.vx;
          b.x += Math.sign(dx || 1) * (overlapX + 1);
        } else {
          b.vy = -b.vy;
          b.y += Math.sign(dy || -1) * (overlapY + 1);
        }
        spawnParticles(blk.x + blk.w / 2, blk.y + blk.h / 2, '#FFFFFF');
        spawnFloatText(blk.x + blk.w / 2, blk.y, '\uD83D\uDCA5 -1 HIT', '#FFB800');
        // First-hit sounds
        if (blk.carTarget)  playVehicleHitTone(true);
        else if (blk.isTurbo) playTurboBlockTone();
        else                 playBlockHitTone(state.combo);
        break;
      }

      blk.alive = false;
      aliveCount--;

      // STREAK: increment combo on every block destroy (cap 8).
      // Increment BEFORE score/energy calc so this hit already benefits.
      if (b === ball) {
        state.combo = Math.min(state.combo + 1, 8);
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;
        updateComboUI();
        if (state.combo >= 4) triggerScreenShake(4, 0.2);
      }

      const overlapX = b.r - Math.abs(dx);
      const overlapY = b.r - Math.abs(dy);
      // Skip bounce when piercing
      if (!wasPiercing) {
        if (overlapX < overlapY) {
          b.vx = -b.vx;
          b.x += Math.sign(dx || 1) * (overlapX + 1);
        } else {
          b.vy = -b.vy;
          b.y += Math.sign(dy || -1) * (overlapY + 1);
        }
      }

      // Final-destroy hit sounds
      if (blk.carTarget)  playVehicleHitTone(false);
      else if (blk.isTurbo) playTurboBlockTone();
      else                 playBlockHitTone(state.combo);

      let energyGain, scoreGain;
      const baseEnergy = (BLOCK_ROW_ENERGY_BASE[Math.min(blk.row, 3)] || 3) * state.combo;
      const bonusMult  = state.level > 4 ? 1 + (state.level - 4) * 0.15 : 1;
      if (blk.isTurbo) {
        energyGain = baseEnergy * 2 + 4;
        scoreGain  = Math.round((baseEnergy * 20 * state.combo + 180) * bonusMult);
      } else if (blk.carTarget) {
        const vBonus = (blk.vehicleKey && VEHICLE_BONUS[blk.vehicleKey]) ? VEHICLE_BONUS[blk.vehicleKey] : { score: CAR_TARGET_BONUS_SCORE, label: 'CAR' };
        energyGain = baseEnergy + CAR_TARGET_BONUS_ENERGY;
        scoreGain  = Math.round((baseEnergy * 10 * state.combo + vBonus.score) * bonusMult);
      } else {
        energyGain = baseEnergy;
        scoreGain  = Math.round(baseEnergy * 10 * state.combo * bonusMult);
      }

      state.energy  = Math.min(state.energy + energyGain, MAX_ENERGY);
      state.score  += scoreGain;
      state.hits++;

      if (blk.carTarget) {
        state.carTargetsHit++;
        const carProgress = document.getElementById('car-progress');
        if (carProgress) {
          carProgress.classList.add('car-target-hit');
          setTimeout(() => carProgress.classList.remove('car-target-hit'), 380);
        }
      }

      setEl('hit-count', String(state.hits));
      updateEnergyUI();
      updateCarUI();

      const blockColor = blk.isTurbo ? TURBO_BLOCK_COLOR : BLOCK_COLORS[Math.min(blk.row, 3)];
      spawnParticles(blk.x + blk.w / 2, blk.y + blk.h / 2, blockColor);

      let label = state.combo > 1 ? `+${energyGain}⚡ ×${state.combo}🔥` : `+${energyGain}⚡`;
      if (blk.isTurbo) {
        label = `⚡ TURBO +${energyGain}`;
      } else if (blk.carTarget) {
        const vBonus2 = (blk.vehicleKey && VEHICLE_BONUS[blk.vehicleKey]) ? VEHICLE_BONUS[blk.vehicleKey] : { score: CAR_TARGET_BONUS_SCORE, label: 'CAR' };
        label = `⚡ ${vBonus2.label} +${vBonus2.score}!`;
        spawnFloatText(blk.x + blk.w / 2, blk.y + blk.h / 2, label, '#67C23A');
        // C10 special jackpot celebration
        if (blk.vehicleKey === 'c10') {
          spawnFloatText(cw / 2, ch * 0.30, '🎉 C10 JACKPOT!', '#67C23A');
          triggerScreenShake(10, 0.55);
          spawnOvertakeBurst(blk.x + blk.w / 2, blk.y + blk.h / 2);
          playC10JackpotTone();
        }
        // Reset label so we don't duplicate the float text below
        label = null;
      }
      if (label) spawnFloatText(blk.x + blk.w / 2, blk.y + blk.h / 2, label, blockColor);

      if (state.energy >= MAX_ENERGY && !state.fullChargeRewarded) {
        flashFullCharge();
        // Reset battery for next cycle (rechargeable)
        state.fullChargeRewarded = true;  // guard flag: cleared inside flashFullCharge after reset
      }

      // Vehicle Power-Up activation (einmalig pro finalem Treffer)
      if (blk.carTarget && blk.vehicleKey) {
        activateVehiclePowerUp(blk.vehicleKey, blk.x + blk.w / 2, blk.y + blk.h / 2);
      }

      break;
    }
  }

  if (b === ball && aliveCount === 0) respawnBlocks();
}

// ═══════════════════════════════════════════════════════════
// PARTICLES & FLOAT TEXTS
// ═══════════════════════════════════════════════════════════
function spawnParticles(x, y, color) {
  const MAX_PARTICLES = 80;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    if (particles.length >= MAX_PARTICLES) particles.shift(); // evict oldest
    const angle = (Math.PI * 2 * i / PARTICLE_COUNT) + Math.random() * 0.6;
    const spd   = 60 + Math.random() * 140;
    particles.push({
      x, y,
      vx:      Math.cos(angle) * spd,
      vy:      Math.sin(angle) * spd - 80,
      life:    0.45 + Math.random() * 0.25,
      maxLife: 0.7,
      color,
      size:    2 + Math.random() * 3,
    });
  }
}

function spawnFloatText(x, y, text, color) {
  // Cap at 8 simultaneous float texts to prevent render-load spikes.
  // Evict the oldest entry when at capacity.
  if (floatTexts.length >= 8) floatTexts.shift();
  floatTexts.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x    += p.vx * dt;
    p.y    += p.vy * dt;
    p.vy   += 260 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateFloatTexts(dt) {
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const t = floatTexts[i];
    t.y    -= 55 * dt;
    t.life -= dt;
    if (t.life <= 0) floatTexts.splice(i, 1);
  }
}

// ═══════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════
function render() {
  let shakeX = 0, shakeY = 0;
  if (screenShakeTimer > 0) {
    const mag = screenShakeAmt * (screenShakeTimer / 0.45);
    shakeX = (Math.random() * 2 - 1) * mag;
    shakeY = (Math.random() * 2 - 1) * mag;
  }

  ctx.save();
  if (shakeX !== 0 || shakeY !== 0) ctx.translate(shakeX, shakeY);

  ctx.clearRect(-Math.abs(shakeX) - 2, -Math.abs(shakeY) - 2, cw + 20, ch + 20);

  if (ballMissFlash > 0) {
    ctx.fillStyle = `rgba(255,32,0,${ballMissFlash * 0.22})`;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (newWaveFlash > 0) {
    // During overtake drama newWaveFlash can be >1 → clamp alpha at 0.55
    const flashAlpha = Math.min(newWaveFlash * 0.22, 0.55);
    ctx.fillStyle = `rgba(103,194,58,${flashAlpha})`;
    ctx.fillRect(0, 0, cw, ch);
  }

  renderBlocks();
  renderParticles();
  renderPaddle();
  renderBall();
  if (ball2.active) renderBall2();
  renderFloatTexts();
  if (hintAlpha > 0) renderHint();
  if (levelOverlay.active) renderLevelOverlay();
  if (overtakeFlash > 0) renderOvertakeBanner();

  ctx.restore();
}

function renderBlocks() {
  for (const b of blocks) {
    if (!b.alive) continue;

    let color;
    if (b.isTurbo) {
      color = TURBO_BLOCK_COLOR;
    } else {
      color = BLOCK_COLORS[Math.min(b.row, 3)];
    }

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = b.isTurbo ? 14 : 7;
    roundRect(ctx, b.x, b.y, b.w, b.h, 4);

    const alphaFill = (b.carTarget && b.hitsLeft <= 1 && b.hitsLeft < 2) ? 0.55 : 0.82;
    ctx.fillStyle = hexToRgba(color, alphaFill);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, 3, 1.5);
    ctx.fill();

    if (b.isTurbo) {
      ctx.fillStyle    = 'rgba(255,255,255,0.9)';
      ctx.font         = `bold ${Math.max(8, b.h * 0.65)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur   = 0;
      ctx.fillText('⚡', b.x + b.w / 2, b.y + b.h / 2);
    }

    if (b.carTarget) {
      ctx.lineWidth   = b.hitsLeft >= 2 ? 2.5 : 1.8;
      ctx.strokeStyle = b.hitsLeft >= 2 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
      roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 4);
      ctx.stroke();
      // Draw vehicle sprite (or fallback icon)
      if (b.vehicleKey) {
        drawVehicleSprite(b.x, b.y, b.w, b.h, b.vehicleKey);
      } else {
        drawCarBlock(b.x, b.y, b.w, b.h);
      }

      if (b.hitsLeft >= 2) {
        ctx.fillStyle    = 'rgba(255,255,255,0.85)';
        ctx.font         = `bold ${Math.max(7, b.h * 0.55)}px sans-serif`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'top';
        ctx.shadowBlur   = 0;
        ctx.fillText('2×', b.x + b.w - 2, b.y + 1);
      }
    }
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────
// PADDLE REDESIGN: sleek neon-pong bar, Leapmotor-CI
// ─────────────────────────────────────────────────────
function renderPaddle() {
  const x = paddle.x;
  const y = paddle.y;
  const w = paddle.w;
  const h = Math.max(12, paddle.h);
  const r = h / 2;  // fully rounded ends

  ctx.save();

  // Outer green glow
  ctx.shadowColor = '#67C23A';
  ctx.shadowBlur  = 18;
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = 'rgba(103,194,58,0.55)';
  ctx.lineWidth   = 4;
  ctx.stroke();

  ctx.shadowBlur  = 0;

  // Main body: dark glossy black
  roundRect(ctx, x, y, w, h, r);
  const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
  bodyGrad.addColorStop(0,    '#2A2A2A');
  bodyGrad.addColorStop(0.45, '#111111');
  bodyGrad.addColorStop(1,    '#000000');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Green accent stripe at top
  const stripeH = Math.max(3, h * 0.30);
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const stripeGrad = ctx.createLinearGradient(x, y, x, y + stripeH);
  stripeGrad.addColorStop(0, 'rgba(103,194,58,0.90)');
  stripeGrad.addColorStop(1, 'rgba(103,194,58,0.20)');
  ctx.fillStyle = stripeGrad;
  ctx.fillRect(x, y, w, stripeH);
  ctx.restore();

  // Crisp bright-green border line
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = '#67C23A';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // White sheen highlight (top portion)
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const sheenGrad = ctx.createLinearGradient(x, y, x, y + h * 0.45);
  sheenGrad.addColorStop(0,   'rgba(255,255,255,0.18)');
  sheenGrad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  sheenGrad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = sheenGrad;
  ctx.fillRect(x, y, w, h * 0.45);
  ctx.restore();

  ctx.restore();
}

function renderBall() {
  ctx.save();
  ctx.shadowColor = '#F5E642';
  ctx.shadowBlur  = 20;

  const g = ctx.createRadialGradient(
    ball.x - ball.r * 0.3, ball.y - ball.r * 0.35, ball.r * 0.08,
    ball.x, ball.y, ball.r
  );
  g.addColorStop(0,   '#FFFFFF');
  g.addColorStop(0.4, '#F5E642');
  g.addColorStop(1,   '#C49A00');

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth   = 1.2;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r * 0.68, 0.15, Math.PI - 0.15);
  ctx.stroke();

  ctx.restore();
}

function renderBall2() {
  if (!ball2.active) return;
  ctx.save();
  ctx.shadowColor = '#67C23A';
  ctx.shadowBlur  = 22;

  const g2 = ctx.createRadialGradient(
    ball2.x - ball2.r * 0.3, ball2.y - ball2.r * 0.35, ball2.r * 0.08,
    ball2.x, ball2.y, ball2.r
  );
  g2.addColorStop(0,   '#FFFFFF');
  g2.addColorStop(0.4, '#95D475');
  g2.addColorStop(1,   '#529B2E');

  ctx.beginPath();
  ctx.arc(ball2.x, ball2.y, ball2.r, 0, Math.PI * 2);
  ctx.fillStyle = g2;
  ctx.fill();

  // Constant accent ring (no timer — multi-ball lasts until the ball is lost)
  ctx.strokeStyle = 'rgba(103,194,58,0.6)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(ball2.x, ball2.y, ball2.r + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function renderParticles() {
  for (const p of particles) {
    const a = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function renderFloatTexts() {
  const fontSize = Math.max(11, Math.round(cw * 0.042));
  for (const t of floatTexts) {
    const a = Math.min(1, t.life / t.maxLife * 2.2);
    ctx.save();
    ctx.globalAlpha  = a;
    ctx.fillStyle    = t.color;
    ctx.shadowColor  = t.color;
    ctx.shadowBlur   = 10;
    ctx.font         = `800 ${fontSize}px 'Montserrat', sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
}

function renderHint() {
  const hintY    = ch - PADDLE_BOTTOM_PAD - PADDLE_HEIGHT - ball.r - 28;
  const fontSize = Math.max(9, Math.round(cw * 0.031));
  ctx.save();
  ctx.globalAlpha  = hintAlpha * 0.7;
  ctx.fillStyle    = '#FFFFFF';
  ctx.font         = `600 ${fontSize}px 'Montserrat', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  // When the ball waits on the paddle, prompt the player to tap to launch.
  const hintMsg = ballLaunched
    ? '← Schläger bewegen · 🚗 Ziele treffen →'
    : '👆 TIPPEN ZUM STARTEN';
  ctx.fillText(hintMsg, cw / 2, hintY);
  ctx.restore();
}

function renderLevelOverlay() {
  if (!levelOverlay.active) return;

  const progress = 1 - levelOverlay.timer / LEVEL_OVERLAY_DURATION;
  let alpha;
  if (progress < 0.15) {
    alpha = progress / 0.15;
  } else if (progress > 0.75) {
    alpha = (1 - progress) / 0.25;
  } else {
    alpha = 1;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  const scale   = 1 + (1 - progress) * 0.4;
  const lvl     = levelOverlay.level;
  const colors  = ['', '#67C23A', '#95D475', '#FFFFFF', '#67C23A'];
  const color   = colors[Math.min(lvl, 4)] || '#67C23A';
  const label   = levelOverlay.label || getLevelLabel(lvl);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cw / 2, ch / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cw / 2, -ch / 2);

  const pillW = cw * 0.72;
  const pillH = ch * 0.22;
  const pillX = cw / 2 - pillW / 2;
  const pillY = ch / 2 - pillH / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  roundRect(ctx, pillX, pillY, pillW, pillH, 16);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.5;
  roundRect(ctx, pillX, pillY, pillW, pillH, 16);
  ctx.stroke();

  const fs1 = Math.max(18, Math.round(cw * 0.10));
  ctx.fillStyle    = color;
  ctx.shadowColor  = color;
  ctx.shadowBlur   = 28;
  ctx.font         = `900 ${fs1}px 'Montserrat', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const titleText  = `LEVEL ${lvl}`;
  ctx.fillText(titleText, cw / 2, ch / 2 - pillH * 0.12);

  const fs2 = Math.max(10, Math.round(cw * 0.05));
  ctx.shadowBlur   = 10;
  ctx.fillStyle    = 'rgba(255,255,255,0.85)';
  ctx.font         = `700 ${fs2}px 'Montserrat', sans-serif`;
  ctx.fillText(label, cw / 2, ch / 2 + pillH * 0.28);

  ctx.restore();
}

function renderOvertakeBanner() {
  if (overtakeFlash <= 0) return;

  // Total duration is SLOWMO_DURATION + 0.8, fade in first 0.2s, hold, fade out last 0.5s
  const totalDur = SLOWMO_DURATION + 0.8;
  const elapsed  = totalDur - overtakeFlash;
  let alpha;
  if (elapsed < 0.18) {
    alpha = elapsed / 0.18;
  } else if (overtakeFlash < 0.5) {
    alpha = overtakeFlash / 0.5;
  } else {
    alpha = 1;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  // Scale: slight zoom-in effect
  const scale = 1.0 + 0.08 * Math.sin(elapsed * Math.PI / totalDur);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cw / 2, ch * 0.5);
  ctx.scale(scale, scale);
  ctx.translate(-cw / 2, -ch * 0.5);

  // Semi-transparent dark bar
  const barH = ch * 0.18;
  const barY = ch * 0.5 - barH / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, barY, cw, barH);

  // Green top/bottom edge lines
  ctx.fillStyle = '#67C23A';
  ctx.fillRect(0, barY, cw, 3);
  ctx.fillRect(0, barY + barH - 3, cw, 3);

  // Main OVERTAKE text
  const fs1 = Math.max(28, Math.round(cw * 0.13));
  ctx.fillStyle   = '#67C23A';
  ctx.shadowColor = '#67C23A';
  ctx.shadowBlur  = 30;
  ctx.font        = `900 ${fs1}px 'Montserrat', sans-serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OVERTAKE!', cw / 2, ch * 0.5 - barH * 0.08);

  // Sub-label
  const fs2 = Math.max(11, Math.round(cw * 0.048));
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = 'rgba(255,255,255,0.90)';
  ctx.font        = `700 ${fs2}px 'Montserrat', sans-serif`;
  ctx.fillText('🏁 GHOST CAR ÜBERHOLT!', cw / 2, ch * 0.5 + barH * 0.30);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// UI DOM UPDATES
// ═══════════════════════════════════════════════════════════
function updateComboUI() {
  const el = document.getElementById('combo-value');
  if (!el) return;
  el.textContent = `×${state.combo}`;
  el.className   = 'hud-value combo-val';
  if (state.combo >= 5) el.classList.add('x5');
  else if (state.combo >= 4) el.classList.add('x4');
  else if (state.combo >= 3) el.classList.add('x3');
  else if (state.combo >= 2) el.classList.add('x2');

  if (state.combo >= 2) {
    el.style.transform = 'scale(1.3)';
    setTimeout(() => { el.style.transform = ''; }, 150);
  }
}

function updateEnergyUI() {
  const pct      = Math.round(state.energy);
  const fill     = document.getElementById('battery-fill');
  const pctLabel = document.getElementById('battery-pct');
  const spark    = document.getElementById('spark-line');
  if (!fill || !pctLabel) return;

  fill.style.width     = `${pct}%`;
  pctLabel.textContent = `${pct}%`;

  if (pct >= 100) {
    fill.classList.add('full');
    pctLabel.classList.add('full');
    if (spark) spark.classList.remove('active');
  } else {
    if (pct > 60) {
      fill.style.background =
        `linear-gradient(90deg, var(--leap-green-deep), var(--leap-green) ${pct}%, var(--leap-green-soft))`;
    }
    if (spark) {
      const trackW = fill.parentElement.offsetWidth;
      spark.style.left = `${Math.max(0, (pct / 100) * trackW - 5)}px`;
      spark.classList.add('active');
    }
  }
}

function updateCarUI() {
  const pct         = state.energy / MAX_ENERGY;
  const carProgress = document.getElementById('car-progress');
  if (!carProgress) return;
  const track    = document.querySelector('.car-track');
  const trackW   = track ? track.offsetWidth : 200;
  const playerMax = trackW - 50 - 36;
  carProgress.style.left = `${8 + pct * playerMax}px`;

  const carEl = document.getElementById('game-car');
  if (carEl) {
    const glow = Math.round(pct * 28);
    carEl.style.filter = `drop-shadow(0 2px ${glow}px rgba(103,194,58,${pct * 0.8}))`;
  }
  const exhaust = document.getElementById('car-exhaust');
  if (exhaust) {
    exhaust.classList.add('active');
    setTimeout(() => exhaust.classList.remove('active'), 400);
  }
}

// Cheerful rising chime when the battery hits full charge (bonus cue).
function playFullChargeTone() {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  // Play as a short arpeggio (staggered 80 ms apart) instead of a simultaneous chord.
  [523, 659, 784].forEach(function(freq, i) {
    const t = ac.currentTime + i * 0.08;
    try {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      env.gain.setValueAtTime(0.16, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(env);
      env.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.27);
    } catch(e) {}
  });
}

function flashFullCharge() {
  state.score += FULL_CHARGE_BONUS_SCORE;
  state.fullChargeBonuses++;
  newWaveFlash = Math.max(newWaveFlash, 0.6);

  // Ball speed boost
  const currentSpeed = Math.hypot(ball.vx, ball.vy) || state.ballSpeedPx;
  const turboSpeed   = Math.min(currentSpeed * 1.18, GAME_CFG.ballMaxSpeed * ch);
  if (currentSpeed > 0) {
    const k = turboSpeed / currentSpeed;
    ball.vx *= k;
    ball.vy *= k;
  }
  state.ballSpeedPx = Math.min(state.ballSpeedPx * 1.12, GAME_CFG.ballMaxSpeed * ch);

  // Gameplay bonus: Extra-Ball (only when enabled and level threshold met)
  if (GAME_CFG.extraBallEnabled && state.level >= GAME_CFG.extraBallMinLevel && !ball2.active) {
    spawnBall2();
    spawnFloatText(cw / 2, ch * 0.33, '⚡ DOPPELBALL!', '#67C23A');
  }
  spawnFloatText(cw / 2, ch * 0.44, `AUFGELADEN! +${FULL_CHARGE_BONUS_SCORE}`, '#95D475');
  playFullChargeTone();

  // Ghost-car overtake happens ONLY ONCE — the single dramatic moment that
  // secures the instant win. Only trigger it when the instant-win conditions
  // are actually met (not on every battery charge). Otherwise a full battery
  // just gives its bonuses (points + turbo + extra ball) with no overtake drama.
  if (!state.instantWinTriggered && isInstantWinReady()) {
    triggerGhostOvertake();
  }

  const carProg  = document.getElementById('car-progress');
  const ghostEl2 = document.getElementById('ghost-car');
  const carEl    = document.getElementById('game-car');
  if (carEl) {
    carEl.classList.add('boost-mode');
    carProg?.classList.add('boosting');

    if (ghostEl2) {
      ghostEl2.classList.add('ghost-overtaken');
      setTimeout(() => {
        ghostEl2.classList.remove('ghost-overtaken');
        ghostEl2.classList.add('ghost-reset');
        state.ghostTrackPos  = 0.20;
        state.ghostOvertaken = false;
        setTimeout(() => ghostEl2.classList.remove('ghost-reset'), 500);
      }, 1600);
    }

    setTimeout(() => {
      if (!state.gameActive) return;
      carEl.classList.remove('boost-mode');
      carProg?.classList.remove('boosting');
    }, 1800);
  }

  const boostOverlay = document.getElementById('boost-overlay');
  if (boostOverlay) {
    boostOverlay.classList.add('show');
    setTimeout(() => boostOverlay.classList.remove('show'), 2200);
  }

  triggerScreenShake(6, 0.4);
  playTone(880, 'sine', 0.25, 0.6);

  // Reset battery for next cycle — short cooldown via setTimeout
  // prevents immediate re-trigger on the same frame
  setTimeout(() => {
    if (!state.gameActive) return;
    state.energy           = 0;
    state.fullChargeRewarded = false;
    updateEnergyUI();
  }, 80);
}

// ═══════════════════════════════════════════════════════════
// OVERTAKE-MOMENT + SOFORT-GEWINN-PAUSE-FLOW (Umbau 2)
// ═══════════════════════════════════════════════════════════

// Slow-motion state
let slowMoActive  = false;
let slowMoTimer   = 0;
let slowMoFactor  = 1.0; // multiplied into dt
const SLOWMO_DURATION = 0.9;  // seconds of slow-motion
const SLOWMO_SPEED    = 0.18; // dt multiplier during slomo (5× slower)

// Big OVERTAKE text flash
let overtakeFlash = 0; // countdown in seconds

// True when all instant-win conditions are met (level 2 cleared + score threshold).
function isInstantWinReady() {
  const ev = window.LEAP_EVENT;
  if (!ev) return false;
  if (state.maxLevelReached < 3) return false; // level 2 must be cleared first
  return computeCurrentScore() >= GAME_CFG.instantWinScore;
}

function triggerGhostOvertake() {
  // Fires only once per game — the single overtake moment for the instant win.
  if (state.instantWinTriggered) return;
  state.ghostOvertaken = true;

  // --- DRAMA: Gänsehaut-Moment ---
  startOvertakeDrama();

  state.instantWinTriggered = true;
  // Wait for drama to finish, THEN pause for instant-win form
  const dramaMs = SLOWMO_DURATION * 1000 + 600; // slomo + brief hold
  setTimeout(() => {
    if (!state.gameActive) return;
    pauseForInstantWin();
  }, dramaMs);
}

function startOvertakeDrama() {
  // 1. Slow-motion
  slowMoActive = true;
  slowMoTimer  = SLOWMO_DURATION;

  // 2. Big screen shake
  triggerScreenShake(14, 0.6);

  // 3. Massive green screen flash
  newWaveFlash = 1.8; // reuse wave-flash channel with big value for green

  // 4. Particle burst from ghost car position
  const ghostEl = document.getElementById('ghost-car');
  if (ghostEl && canvas) {
    const rect  = canvas.getBoundingClientRect();
    const gRect = ghostEl.getBoundingClientRect();
    const gx = (gRect.left + gRect.width / 2 - rect.left) * (cw / (rect.width || cw));
    const gy = ch * 0.88; // track is near bottom of canvas
    spawnOvertakeBurst(gx, gy);
  } else {
    spawnOvertakeBurst(cw / 2, ch * 0.88);
  }

  // 5. Big OVERTAKE! float text — staged
  overtakeFlash = SLOWMO_DURATION + 0.8;
  spawnFloatText(cw / 2, ch * 0.22, '🏁 OVERTAKE!',    '#67C23A');
  setTimeout(() => spawnFloatText(cw / 2, ch * 0.35, '⚡ GHOST ÜBERHOLT!', '#FFFFFF'), 180);

  // 6. Triumph WebAudio tone
  playOvertakeTone();
}

function spawnOvertakeBurst(x, y) {
  // Big burst: more particles, outward at high speed
  const MAX_PARTICLES = 80;
  const colors = ['#67C23A', '#95D475', '#FFFFFF', '#FFB800', '#67C23A'];
  for (let i = 0; i < 40; i++) {
    if (particles.length >= MAX_PARTICLES) particles.shift(); // evict oldest
    const angle = (Math.PI * 2 * i / 40) + Math.random() * 0.5;
    const spd   = 90 + Math.random() * 280;
    const color = colors[i % colors.length];
    particles.push({
      x, y,
      vx:      Math.cos(angle) * spd,
      vy:      Math.sin(angle) * spd - 120,
      life:    0.7 + Math.random() * 0.5,
      maxLife: 1.2,
      color,
      size:    3 + Math.random() * 6,
    });
  }
}

// ─── Countdown blip tones (MK64-style, licence-free reimagining) ──────────────────
// Steps 0,1,2 = '3','2','1' → short low blip (~440 Hz)
// Step  3     = 'GO!'        → bright rising tone (~880 Hz, longer)
function playCountdownBlip(step) {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    if (step < 3) {
      // Low short blip for 3, 2, 1
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, ac.currentTime);
      osc.frequency.linearRampToValueAtTime(420, ac.currentTime + 0.12);
      env.gain.setValueAtTime(0.22, ac.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
      osc.connect(env);
      env.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.22);
    } else {
      // 'GO!' — bright rising two-note chime
      [[880, 0.00, 0.20, 0.30], [1320, 0.12, 0.38, 0.28]].forEach(function([freq, t, dur, gain]) {
        const osc = ac.createOscillator();
        const env = ac.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ac.currentTime + t);
        osc.frequency.linearRampToValueAtTime(freq * 1.08, ac.currentTime + t + dur * 0.5);
        env.gain.setValueAtTime(0, ac.currentTime + t);
        env.gain.linearRampToValueAtTime(gain, ac.currentTime + t + 0.03);
        env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + dur);
        osc.connect(env);
        env.connect(ac.destination);
        osc.start(ac.currentTime + t);
        osc.stop(ac.currentTime + t + dur + 0.05);
      });
    }
  } catch(e) {}
}

function playC10JackpotTone() {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  // Joyful ascending arpeggio + bright chime for C10 jackpot hit
  const seq = [
    { freq: 523,  t: 0.00, dur: 0.18, gain: 0.28, type: 'triangle' },
    { freq: 659,  t: 0.09, dur: 0.18, gain: 0.28, type: 'triangle' },
    { freq: 784,  t: 0.18, dur: 0.22, gain: 0.30, type: 'triangle' },
    { freq: 1047, t: 0.27, dur: 0.45, gain: 0.26, type: 'sine'     },
    { freq: 1319, t: 0.36, dur: 0.55, gain: 0.22, type: 'sine'     },
    // bass punch
    { freq: 65,   t: 0.00, dur: 0.18, gain: 0.32, type: 'sine'     },
  ];
  seq.forEach(function({ freq, t, dur, gain, type }) {
    try {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime + t);
      env.gain.setValueAtTime(0,    ac.currentTime + t);
      env.gain.linearRampToValueAtTime(gain, ac.currentTime + t + 0.03);
      env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + dur);
      osc.connect(env);
      env.connect(ac.destination);
      osc.start(ac.currentTime + t);
      osc.stop(ac.currentTime + t + dur + 0.05);
    } catch(e) {}
  });
}

function playOvertakeTone() {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  // Rising triumphant arpeggio: A4 → E5 → A5 → C#6 (energetic)
  const sequence = [
    { freq: 440,  t: 0.00, dur: 0.35, gain: 0.28, type: 'triangle' },
    { freq: 659,  t: 0.10, dur: 0.35, gain: 0.26, type: 'triangle' },
    { freq: 880,  t: 0.20, dur: 0.45, gain: 0.30, type: 'triangle' },
    { freq: 1109, t: 0.32, dur: 0.60, gain: 0.24, type: 'triangle' },
    // Sub-bass punch on beat
    { freq: 80,   t: 0.00, dur: 0.25, gain: 0.35, type: 'sine'     },
  ];
  sequence.forEach(({ freq, t, dur, gain, type }) => {
    try {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime + t);
      env.gain.setValueAtTime(0,    ac.currentTime + t);
      env.gain.linearRampToValueAtTime(gain, ac.currentTime + t + 0.04);
      env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + dur);
      osc.connect(env);
      env.connect(ac.destination);
      osc.start(ac.currentTime + t);
      osc.stop(ac.currentTime + t + dur + 0.05);
    } catch(e) {}
  });
}

// ═══════════════════════════════════════════════════════════
// HIT SOUNDS
// ═══════════════════════════════════════════════════════════

// Normal block hit — pitch rises with combo
function playBlockHitTone(combo) {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const freq = 220 * (1 + Math.min(combo, 8) * 0.08);
    const osc  = ac.createOscillator();
    const env  = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    env.gain.setValueAtTime(0.15, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    osc.connect(env); env.connect(ac.destination);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.17);
  } catch(e) {}
}

// Turbo block hit — electric zap
function playTurboBlockTone() {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.15);
    env.gain.setValueAtTime(0.20, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    osc.connect(env); env.connect(ac.destination);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.20);
  } catch(e) {}
}

// Vehicle block hit: first hit = dull thud, final = satisfying impact sweep
function playVehicleHitTone(isFirstHit) {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = 'sine';
    if (isFirstHit) {
      osc.frequency.setValueAtTime(120, ac.currentTime);
      env.gain.setValueAtTime(0.30, ac.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.20);
      osc.connect(env); env.connect(ac.destination);
      osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.25);
    } else {
      osc.frequency.setValueAtTime(260, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.25);
      env.gain.setValueAtTime(0.35, ac.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
      osc.connect(env); env.connect(ac.destination);
      osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.30);
    }
  } catch(e) {}
}

// Paddle bounce — soft dong
function playPaddleBounceTone() {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, ac.currentTime);
    env.gain.setValueAtTime(0.12, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    osc.connect(env); env.connect(ac.destination);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.23);
  } catch(e) {}
}

// T03 Power-Up: electric zap
function playElectroZapTone() {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.3);
    env.gain.setValueAtTime(0.20, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
    osc.connect(env); env.connect(ac.destination);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.35);
  } catch(e) {}
}

// B05 Power-Up: whoosh sweep
function playSpeedBoostTone() {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.4);
    env.gain.setValueAtTime(0.22, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
    osc.connect(env); env.connect(ac.destination);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.45);
  } catch(e) {}
}

// B10 Power-Up: ascending power chime (3 notes)
function playPaddleBoostTone() {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  const notes = [440, 554, 659];
  notes.forEach(function(freq, i) {
    const delay = i * 0.12;
    try {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
      env.gain.setValueAtTime(0, ac.currentTime + delay);
      env.gain.linearRampToValueAtTime(0.20, ac.currentTime + delay + 0.04);
      env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.35);
      osc.connect(env); env.connect(ac.destination);
      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 0.40);
    } catch(e) {}
  });
}

// ═══════════════════════════════════════════════════════════
// VEHICLE POWER-UPS
// ═══════════════════════════════════════════════════════════

/**
 * Triggered when a vehicle block is finally destroyed.
 * @param {string} key  One of VEHICLE_KEYS
 * @param {number} blkX  Block centre x
 * @param {number} blkY  Block centre y
 */
function activateVehiclePowerUp(key, blkX, blkY) {
  switch (key) {
    case 't03': {
      // ELEKTRO-BALL: next block hit pierces without deflecting
      state.pierceActive = true;
      spawnFloatText(blkX, blkY - 20, '\u26A1 ELEKTRO-BALL!', '#FFD700');
      playElectroZapTone();
      break;
    }
    case 'b05': {
      // SPEED BOOST: +30% for 4 s
      if (state.speedBoostTimer <= 0) {
        // Only apply multiplier if not already boosted
        const curSpd = Math.hypot(ball.vx, ball.vy);
        if (curSpd > 0) {
          ball.vx *= 1.3;
          ball.vy *= 1.3;
        }
        state.ballSpeedPx = Math.min(state.ballSpeedPx * 1.3, GAME_CFG.ballMaxSpeed * ch);
      }
      state.speedBoostTimer = 4.0;
      spawnFloatText(blkX, blkY - 20, '\uD83D\uDD25 SPEED BOOST!', '#FF8C00');
      playSpeedBoostTone();
      break;
    }
    case 'b10': {
      // PADDLE BOOST: +40% width for 4 s
      if (state.paddleBoostTimer <= 0) {
        // Only save base width when not already boosted
        state.paddleBaseW = paddle.w;
        const newW = Math.min(paddle.w * 1.4, cw * 0.6);
        paddle.x  += (paddle.w - newW) / 2; // re-centre
        paddle.w   = newW;
        paddle.x   = Math.max(0, Math.min(cw - paddle.w, paddle.x));
      }
      state.paddleBoostTimer = 4.0;
      spawnFloatText(blkX, blkY - 20, '\u2194\uFE0F PADDLE BOOST!', '#67C23A');
      playPaddleBoostTone();
      break;
    }
    case 'c10': {
      // JACKPOT MULTIBALL: spawn extra ball (jackpot text+sound already in checkBlockCollisions)
      if (!ball2.active) spawnBall2();
      break;
    }
  }
}

function computeCurrentScore() {
  // Live score estimate (same formula as endGame but partial)
  const energyPct = Math.round(state.energy);
  return Math.round(
    state.hits            * 18 +
    (state.maxCombo - 1)  * state.hits * 8 +
    energyPct             * 12 +
    state.wavesCleared    * 250 +
    state.carTargetsHit   * CAR_TARGET_BONUS_SCORE +
    state.fullChargeBonuses * FULL_CHARGE_BONUS_SCORE +
    (state.maxLevelReached - 1) * 300 +
    (state.ghostOvertaken ? 500 : 0)
  );
}

function pauseForInstantWin() {
  // Pause game loop
  state.gamepaused = true;
  cancelAnimationFrame(state.rafId);
  stopBgMusic();

  // Store preliminary score for form
  const energyPct  = Math.round(state.energy);
  const durationS  = session.gameStartTs
    ? Math.round((Date.now() - session.gameStartTs) / 1000)
    : 0;

  const liveScore = computeCurrentScore();
  const ev        = window.LEAP_EVENT;

  session.pendingScore = {
    event_id:        (ev && ev.id) ? ev.id : (window.LEAP_EVENT && window.LEAP_EVENT.id) ? window.LEAP_EVENT.id : null,
    score:           liveScore,
    level_reached:   state.maxLevelReached,
    ghost_overtaken: true,
    play_duration_s: durationS,
    is_instant_win:  true,
  };
  // event_id must always be present for RPC signature match

  // Show overlay
  const overlay = document.getElementById('instant-win-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    // Populate score preview
    const scoreEl = document.getElementById('iwo-score');
    if (scoreEl) scoreEl.textContent = liveScore.toLocaleString('de-DE');
    // Wire up the "Daten eingeben" button
    const btn = document.getElementById('iwo-enter-data-btn');
    if (btn) {
      btn.onclick = () => {
        overlay.classList.add('hidden');
        openOptinForInstantWin();
      };
    }
    // Wire up the "Weiterspielen & Highscore knacken" button
    const skipBtn = document.getElementById('iwo-skip-btn');
    if (skipBtn) {
      skipBtn.onclick = () => {
        state.instantWinPending = true;
        overlay.classList.add('hidden');
        resumeAfterInstantWin(false);
      };
    }
  }
}

function openOptinForInstantWin() {
  // Show the inline optin on screen-game
  const section = document.getElementById('game-optin-section');
  if (section) {
    section.classList.remove('hidden');
    const form    = document.getElementById('game-optin-form');
    if (form) form.reset();
    const errorEl = document.getElementById('game-optin-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
    const btn = document.getElementById('game-optin-submit-btn');
    if (btn) { btn.disabled = false; btn.textContent = '✅ GEWINN SICHERN'; }
    // Prefill from localStorage for convenience
    prefillGameOptinFromStorage();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function resumeAfterInstantWin(codeShown) {
  // Resume game loop
  state.gamepaused    = false;
  state.lastFrameTime = performance.now();
  state.rafId         = requestAnimationFrame(gameFrame);
  startBgMusic();

  if (!codeShown) {
    spawnFloatText(cw / 2, ch * 0.35, '▶ WEITER SPIELEN!', '#67C23A');
  }
}

// Submit handler for in-game instant-win form
function handleGameOptinSubmit(e) {
  e.preventDefault();
  if (session.submitted) return;

  const form      = document.getElementById('game-optin-form');
  const errorEl   = document.getElementById('game-optin-error');
  const submitBtn = document.getElementById('game-optin-submit-btn');
  const errors    = [];

  errorEl.textContent = '';
  errorEl.classList.add('hidden');
  form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  form.querySelectorAll('.error-radio').forEach(el => el.classList.remove('error-radio'));

  const v = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  if (!v('gfi-contact')) { errors.push('Kontakt-Wunsch auswählen.'); document.getElementById('gfi-contact').classList.add('error'); }
  // Vehicle only required when contact is desired (not 'nein')
  if (v('gfi-contact') !== 'nein' && !v('gfi-vehicle')) { errors.push('Wunschmodell auswählen.'); document.getElementById('gfi-vehicle').classList.add('error'); }
  if (!v('gfi-zip') || v('gfi-zip').length < 4) { errors.push('Gültige PLZ eingeben.'); document.getElementById('gfi-zip').classList.add('error'); }
  if (!v('gfi-city'))  { errors.push('Ort eingeben.');     document.getElementById('gfi-city').classList.add('error'); }
  if (!v('gfi-first')) { errors.push('Vorname eingeben.'); document.getElementById('gfi-first').classList.add('error'); }
  if (!v('gfi-last'))  { errors.push('Nachname eingeben.'); document.getElementById('gfi-last').classList.add('error'); }
  const emailVal = v('gfi-email');
  if (!emailVal || !emailVal.includes('@')) { errors.push('Gültige E-Mail-Adresse eingeben.'); document.getElementById('gfi-email').classList.add('error'); }

  const getRadio = name => {
    const checked = form.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
  };
  const consentStay     = getRadio('g_consent_stay_in_touch');
  const consentBetter   = getRadio('g_consent_better_offers');
  const consentPartners = getRadio('g_consent_partners');
  if (!consentStay)     { errors.push('Newsletter-Einwilligung beantworten.');    form.querySelectorAll('input[name="g_consent_stay_in_touch"]').forEach(r => r.closest('.radio-opt').classList.add('error-radio')); }
  if (!consentBetter)   { errors.push('Angebote-Einwilligung beantworten.');       form.querySelectorAll('input[name="g_consent_better_offers"]').forEach(r => r.closest('.radio-opt').classList.add('error-radio')); }
  if (!consentPartners) { errors.push('Partner-Einwilligung beantworten.');         form.querySelectorAll('input[name="g_consent_partners"]').forEach(r => r.closest('.radio-opt').classList.add('error-radio')); }

  const termsChecked = document.getElementById('gfi-terms').checked;
  if (!termsChecked) { errors.push('Teilnahmebedingungen akzeptieren.'); document.getElementById('gfi-terms').classList.add('error'); }

  if (errors.length > 0) {
    errorEl.innerHTML = errors.map(m => `• ${m}`).join('<br>');
    errorEl.classList.remove('hidden');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = '⏳ Wird gespeichert…';

  const ev2 = window.LEAP_EVENT;
  const playerData = {
    event_id:              ev2 ? ev2.id : undefined,
    contact_intent:        v('gfi-contact'),
    vehicle_interest:      v('gfi-vehicle'),
    zip:                   v('gfi-zip'),
    city:                  v('gfi-city'),
    first_name:            v('gfi-first'),
    last_name:             v('gfi-last'),
    email:                 emailVal,
    phone:                 v('gfi-phone') || null,
    consent_stay_in_touch: consentStay     === 'yes',
    consent_better_offers: consentBetter   === 'yes',
    consent_partners:      consentPartners === 'yes',
    terms_accepted:        true,
    terms_version_at_entry: ev2 ? ev2.terms_version : 1,
    privacy_accepted_at:   new Date().toISOString(),
    entry_source:          'byod',
  };
  // event_id must always be present for RPC signature match

  _doGameOptinSubmit(playerData, submitBtn, errorEl);
}

async function _doGameOptinSubmit(playerData, submitBtn, errorEl) {
  try {
    const ps  = session.pendingScore || {};
    const ev3 = window.LEAP_EVENT;
    const result = await submitEntry({
      event_id:         ev3 ? ev3.id : (ps.event_id || (window.LEAP_EVENT && window.LEAP_EVENT.id) || null),
      score:            ps.score,
      ghost_overtaken:  ps.ghost_overtaken,
      level_reached:    ps.level_reached,
      play_duration_s:  ps.play_duration_s,
      contact_intent:   playerData.contact_intent,
      vehicle_interest: playerData.vehicle_interest,
      zip:              playerData.zip,
      city:             playerData.city,
      first_name:       playerData.first_name,
      last_name:        playerData.last_name,
      email:            playerData.email,
      phone:            playerData.phone,
      consent_stay:     playerData.consent_stay_in_touch,
      consent_offers:   playerData.consent_better_offers,
      consent_partners: playerData.consent_partners,
      terms_accepted:   playerData.terms_accepted,
      terms_version:    playerData.terms_version_at_entry,
      entry_source:     playerData.entry_source || 'byod',
    });

    session.playerId = result && result.player_id;
    session.scoreId  = result && result.score_id;
    if (result && result.is_instant_win && result.claim_code) {
      session.instantWinCode = result.claim_code;
    } else {
      // Fallback: client-side code (shown only if server doesn't return one)
      session.instantWinCode = session.instantWinCode || generateClaimCode();
    }

    session.submitted = true;

    // Save player data to localStorage for future prefill
    savePlayerToStorage(playerData);

    submitBtn.textContent = '✅ Gespeichert!';
    submitBtn.disabled    = true;

    // Show the 4-digit code in game
    const codeWrap = document.getElementById('game-iw-code-wrap');
    if (codeWrap) {
      codeWrap.classList.remove('hidden');
      setEl('game-iw-code', session.instantWinCode);
      codeWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Show "Weiterspielen" button
    const continueBtn = document.getElementById('game-iw-continue-btn');
    if (continueBtn) {
      continueBtn.classList.remove('hidden');
      continueBtn.onclick = () => {
        const section = document.getElementById('game-optin-section');
        if (section) section.classList.add('hidden');
        resumeAfterInstantWin(true);
      };
    }

  } catch (err) {
    console.error('[LEAP] Game opt-in submit failed:', err);
    submitBtn.disabled    = false;
    submitBtn.textContent = '✅ GEWINN SICHERN';
    errorEl.textContent   = `⚠️ Speichern fehlgeschlagen. Bitte erneut versuchen. (${err.message || 'Netzwerkfehler'})`;
    errorEl.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
// INPUT HANDLERS
// ═══════════════════════════════════════════════════════════
function onTouchInput(e) {
  e.preventDefault();
  if (!state.gameActive || state.gamepaused || !e.touches.length) return;
  const touch    = e.touches[0];
  const rect     = canvas.getBoundingClientRect();
  paddle.targetX = (touch.clientX - rect.left) - paddle.w / 2;
  // Allow manual launch on tap if the ball is waiting on the paddle.
  if (!ballLaunched) launchBall();
}

function onPointerInput(e) {
  if (!state.gameActive || state.gamepaused) return;
  const rect     = canvas.getBoundingClientRect();
  paddle.targetX = (e.clientX - rect.left) - paddle.w / 2;
}

// Manual ball launch on click/tap-start (pointerdown) when ball is waiting.
function onLaunchInput(e) {
  if (!state.gameActive || state.gamepaused) return;
  if (!ballLaunched) launchBall();
}

// ═══════════════════════════════════════════════════════════
// LOCAL STORAGE – PLAYER PREFILL
// ═══════════════════════════════════════════════════════════
const PLAYER_STORAGE_KEY = 'leap_player_v1';

function savePlayerToStorage(formData) {
  try {
    const toSave = {
      first_name:       formData.first_name       || '',
      last_name:        formData.last_name         || '',
      email:            formData.email             || '',
      phone:            formData.phone             || '',
      zip:              formData.zip               || '',
      city:             formData.city              || '',
      vehicle_interest: formData.vehicle_interest  || '',
      contact_intent:   formData.contact_intent    || '',
    };
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('[LEAP] savePlayerToStorage failed:', e);
  }
}

function prefillFormFromStorage() {
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    const setField = function(id, val) {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    };
    setField('fi-first',   d.first_name);
    setField('fi-last',    d.last_name);
    setField('fi-email',   d.email);
    setField('fi-phone',   d.phone);
    setField('fi-zip',     d.zip);
    setField('fi-city',    d.city);
    setField('fi-vehicle', d.vehicle_interest);
    setField('fi-contact', d.contact_intent);
    // Consents + TNB: NEVER prefill (DSGVO — must be explicit each time)
  } catch (e) {
    console.warn('[LEAP] prefillFormFromStorage failed:', e);
  }
}

function prefillGameOptinFromStorage() {
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    const setField = function(id, val) {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    };
    setField('gfi-first',   d.first_name);
    setField('gfi-last',    d.last_name);
    setField('gfi-email',   d.email);
    setField('gfi-phone',   d.phone);
    setField('gfi-zip',     d.zip);
    setField('gfi-city',    d.city);
    setField('gfi-vehicle', d.vehicle_interest);
    setField('gfi-contact', d.contact_intent);
    // Consents + TNB: NEVER prefill (DSGVO)
  } catch (e) {
    console.warn('[LEAP] prefillGameOptinFromStorage failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// END GAME
// ═══════════════════════════════════════════════════════════
function endGame() {
  cancelAnimationFrame(state.rafId);
  state.gameActive  = false;
  state.gamepaused  = false;
  stopBgMusic();
  if (ball2.active) deactivateBall2();

  const energyPct = Math.round(state.energy);
  state.score = Math.round(
    state.hits            * 18 +
    (state.maxCombo - 1)  * state.hits * 8 +
    energyPct             * 12 +
    state.wavesCleared    * 250 +
    state.carTargetsHit   * CAR_TARGET_BONUS_SCORE +
    state.fullChargeBonuses * FULL_CHARGE_BONUS_SCORE +
    (state.maxLevelReached - 1) * 300 +
    (state.ghostOvertaken ? 500 : 0) +
    (state.level > 4 ? (state.level - 4) * 200 : 0)
  );

  // Instant-win check for end-screen
  // Also true if player chose to keep playing (instantWinPending)
  const ev = window.LEAP_EVENT;
  let isInstantWin = (state.instantWinTriggered && session.submitted) ||
                     state.instantWinPending;
  if (!isInstantWin) {
    const scoreThreshold = GAME_CFG.instantWinScore;
    const ghostReq       = ev ? ev.instant_win_ghost_req !== false : true;
    isInstantWin = state.score >= scoreThreshold &&
                   (!ghostReq || state.ghostOvertaken);
  }

  const durationS = session.gameStartTs
    ? Math.round((Date.now() - session.gameStartTs) / 1000)
    : 60;

  if (!session.pendingScore || !session.submitted) {
    session.pendingScore = {
      event_id:        (ev && ev.id) ? ev.id : (window.LEAP_EVENT && window.LEAP_EVENT.id) ? window.LEAP_EVENT.id : null,
      score:           state.score,
      level_reached:   state.maxLevelReached,
      ghost_overtaken: state.ghostOvertaken,
      play_duration_s: durationS,
      is_instant_win:  isInstantWin,
    };
    // event_id must always be present for RPC signature match
  } else {
    // Update score to final value
    session.pendingScore.score = state.score;
  }

  if (isInstantWin && !session.instantWinCode) {
    session.instantWinCode = generateClaimCode();
  }

  setTimeout(() => {
    showScreen('screen-end');
    populateEndScreen(energyPct, isInstantWin);
  }, 600);
}

function populateEndScreen(energyPct, isInstantWin) {
  // Fill score values (DOM ready, but not visible until reveal)
  setEl('res-hits',   String(state.hits));
  setEl('res-combo',  `×${state.maxCombo}`);
  setEl('res-energy', `${energyPct}%`);
  setEl('res-score',  '0');  // will be animated on reveal
  setEl('res-waves',  String(state.wavesCleared));

  // Hero sub-text based on win state
  const isWinner = isInstantWin || state.instantWinPending;
  if (isWinner) {
    setEl('end-hero-sub', '🎉 Du hast einen Sofort-Gewinn! Trag dich ein, um deinen Gewinn-Code und Leaderboard-Platz zu sehen.');
  } else {
    setEl('end-hero-sub', 'Füll das Formular aus – dann enthüllen wir deinen Score und deinen Leaderboard-Platz.');
  }

  // CTA button text
  const submitBtn = document.getElementById('optin-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    if (isWinner) {
      submitBtn.textContent = '⚡ GEWINN ABHOLEN & HIGHSCORE SICHERN';
    } else {
      submitBtn.textContent = '🏆 HIGHSCORE SICHERN & RANGLISTE BETRETEN';
    }
  }

  // Show/hide CTA card
  const ctaCard   = document.getElementById('end-cta-card');
  const revealDiv = document.getElementById('end-reveal');

  if (session.submitted) {
    // Already submitted via mid-game form – skip form, show reveal directly
    if (ctaCard)   ctaCard.classList.add('hidden');
    if (revealDiv) {
      revealDiv.classList.remove('hidden');
      revealDiv.classList.add('reveal-active');
    }
    // Show instant win code if available
    _showInstantWinIfNeeded(isInstantWin);
    animateCountUp('res-score', 0, state.score, 1200);
    buildLeaderboard();
  } else {
    // Default: show form, hide reveal
    if (ctaCard) {
      ctaCard.classList.remove('hidden');
      ctaCard.style.opacity       = '';
      ctaCard.style.pointerEvents = '';
    }
    if (revealDiv) revealDiv.classList.add('hidden');
    // Reset form
    const form    = document.getElementById('optin-form');
    if (form) form.reset();
    const errorEl = document.getElementById('optin-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
    // Prefill from localStorage
    prefillFormFromStorage();
  }
}

function _showInstantWinIfNeeded(isInstantWin) {
  const iwBanner = document.getElementById('instant-win-banner');
  if (!iwBanner) return;
  if (isInstantWin || state.instantWinPending) {
    iwBanner.classList.remove('hidden');
    iwBanner.classList.add('win-active');
    if (session.instantWinCode) {
      const iwCodeWrap = document.getElementById('iw-code-wrap');
      if (iwCodeWrap) {
        iwCodeWrap.classList.remove('hidden');
        setEl('iw-code', session.instantWinCode);
      }
    }
  } else {
    iwBanner.classList.add('hidden');
    iwBanner.classList.remove('win-active');
  }
}

// ═══════════════════════════════════════════════════════════
// OPT-IN FORM HANDLER (end screen)
// ═══════════════════════════════════════════════════════════
function handleOptinSubmit(e) {
  e.preventDefault();
  if (session.submitted) return;

  const form      = document.getElementById('optin-form');
  const errorEl   = document.getElementById('optin-error');
  const submitBtn = document.getElementById('optin-submit-btn');
  const errors    = [];

  errorEl.textContent = '';
  errorEl.classList.add('hidden');
  form.querySelectorAll('.error').forEach(function(el) { el.classList.remove('error'); });
  form.querySelectorAll('.error-radio').forEach(function(el) { el.classList.remove('error-radio'); });

  const v = function(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  if (!v('fi-contact')) { errors.push('Kontakt-Wunsch auswählen.');         document.getElementById('fi-contact').classList.add('error'); }
  // Vehicle only required when contact is desired (not 'nein')
  if (v('fi-contact') !== 'nein' && !v('fi-vehicle')) { errors.push('Wunschmodell auswählen.'); document.getElementById('fi-vehicle').classList.add('error'); }
  if (!v('fi-zip') || v('fi-zip').length < 4) { errors.push('Gültige PLZ eingeben.'); document.getElementById('fi-zip').classList.add('error'); }
  if (!v('fi-city'))    { errors.push('Ort eingeben.');                      document.getElementById('fi-city').classList.add('error'); }
  if (!v('fi-first'))   { errors.push('Vorname eingeben.');                  document.getElementById('fi-first').classList.add('error'); }
  if (!v('fi-last'))    { errors.push('Nachname eingeben.');                 document.getElementById('fi-last').classList.add('error'); }
  const emailVal = v('fi-email');
  if (!emailVal || !emailVal.includes('@')) { errors.push('Gültige E-Mail-Adresse eingeben.'); document.getElementById('fi-email').classList.add('error'); }

  const getRadio = function(name) {
    const checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  };
  const consentStay     = getRadio('consent_stay_in_touch');
  const consentBetter   = getRadio('consent_better_offers');
  const consentPartners = getRadio('consent_partners');
  if (!consentStay)     { errors.push('Newsletter-Einwilligung beantworten.');    form.querySelectorAll('input[name="consent_stay_in_touch"]').forEach(function(r) { r.closest('.radio-opt').classList.add('error-radio'); }); }
  if (!consentBetter)   { errors.push('Angebote-Einwilligung beantworten.');       form.querySelectorAll('input[name="consent_better_offers"]').forEach(function(r) { r.closest('.radio-opt').classList.add('error-radio'); }); }
  if (!consentPartners) { errors.push('Partner-Einwilligung beantworten.');         form.querySelectorAll('input[name="consent_partners"]').forEach(function(r)   { r.closest('.radio-opt').classList.add('error-radio'); }); }

  const termsChecked = document.getElementById('fi-terms').checked;
  if (!termsChecked) { errors.push('Teilnahmebedingungen müssen akzeptiert werden.'); document.getElementById('fi-terms').classList.add('error'); }

  if (errors.length > 0) {
    errorEl.innerHTML = errors.map(function(m) { return '• ' + m; }).join('<br>');
    errorEl.classList.remove('hidden');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = '⏳ Wird gespeichert…';

  const ev2 = window.LEAP_EVENT;
  const playerData = {
    event_id:              ev2 ? ev2.id : undefined,
    contact_intent:        v('fi-contact'),
    vehicle_interest:      v('fi-vehicle'),
    zip:                   v('fi-zip'),
    city:                  v('fi-city'),
    first_name:            v('fi-first'),
    last_name:             v('fi-last'),
    email:                 emailVal,
    phone:                 v('fi-phone') || null,
    consent_stay_in_touch: consentStay     === 'yes',
    consent_better_offers: consentBetter   === 'yes',
    consent_partners:      consentPartners === 'yes',
    terms_accepted:        true,
    terms_version_at_entry: ev2 ? ev2.terms_version : 1,
    privacy_accepted_at:   new Date().toISOString(),
    entry_source:          'byod',
  };
  // event_id must always be present for RPC signature match

  _doOptinSubmit(playerData, submitBtn, errorEl);
}

async function _doOptinSubmit(playerData, submitBtn, errorEl) {
  try {
    const ps  = session.pendingScore || {};
    const ev3 = window.LEAP_EVENT;
    // Forward is_instant_win when player had pending win from "Weiterspielen"
    const forceInstantWin = ps.is_instant_win || state.instantWinPending;
    const result = await submitEntry({
      event_id:         ev3 ? ev3.id : (ps.event_id || (window.LEAP_EVENT && window.LEAP_EVENT.id) || null),
      score:            ps.score,
      ghost_overtaken:  ps.ghost_overtaken,
      level_reached:    ps.level_reached,
      play_duration_s:  ps.play_duration_s,
      is_instant_win:   forceInstantWin || undefined,
      contact_intent:   playerData.contact_intent,
      vehicle_interest: playerData.vehicle_interest,
      zip:              playerData.zip,
      city:             playerData.city,
      first_name:       playerData.first_name,
      last_name:        playerData.last_name,
      email:            playerData.email,
      phone:            playerData.phone,
      consent_stay:     playerData.consent_stay_in_touch,
      consent_offers:   playerData.consent_better_offers,
      consent_partners: playerData.consent_partners,
      terms_accepted:   playerData.terms_accepted,
      terms_version:    playerData.terms_version_at_entry,
      entry_source:     playerData.entry_source || 'byod',
    });

    session.playerId = result && result.player_id;
    session.scoreId  = result && result.score_id;
    if (result && result.is_instant_win && result.claim_code) {
      session.instantWinCode = result.claim_code;
    } else {
      session.instantWinCode = null;
    }

    session.submitted = true;

    // Save player data to localStorage (DSGVO: only personal info, no consents)
    savePlayerToStorage(playerData);

    submitBtn.textContent = '✅ Gespeichert!';
    submitBtn.disabled    = true;

    // Hide form card
    const ctaCard = document.getElementById('end-cta-card');
    if (ctaCard) {
      ctaCard.classList.add('hidden');
    }

    // Show reveal section with fade-in
    const revealDiv = document.getElementById('end-reveal');
    if (revealDiv) {
      revealDiv.classList.remove('hidden');
      // Trigger reflow for animation
      void revealDiv.offsetWidth;
      revealDiv.classList.add('reveal-active');
    }

    // Animate score count-up
    animateCountUp('res-score', 0, state.score, 1200);

    // Show instant win banner + code if applicable
    const isWinner = (state.instantWinTriggered && session.submitted) ||
                     state.instantWinPending || !!(result && result.is_instant_win);
    _showInstantWinIfNeeded(isWinner);
    if (session.instantWinCode) {
      const iwCodeWrap = document.getElementById('iw-code-wrap');
      if (iwCodeWrap) {
        iwCodeWrap.classList.remove('hidden');
        setEl('iw-code', session.instantWinCode);
      }
    }

    buildLeaderboard();

  } catch (err) {
    console.error('[LEAP] Opt-in submit failed:', err);
    submitBtn.disabled    = false;
    submitBtn.textContent = '✅ ABSENDEN';
    errorEl.textContent   = `⚠️ Speichern fehlgeschlagen. Bitte erneut versuchen. (${err.message || 'Netzwerkfehler'})`;
    errorEl.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
// REAL LEADERBOARD
// ═══════════════════════════════════════════════════════════
async function buildLeaderboard() {
  const container = document.getElementById('lb-entries');
  if (!container) return;

  let ev = window.LEAP_EVENT;
  if (!ev) {
    // One-shot re-fetch when event was not available at app start and has not
    // been retried from this call yet.  Guard flag prevents infinite loops.
    if (!window.LEAP_EVENT_LOAD_FAILED) {
      container.innerHTML = '<div class="lb-entry" style="justify-content:center;color:var(--muted);font-size:13px">📡 Verbindung wird hergestellt…</div>';
      await initLeapEvent();
      ev = window.LEAP_EVENT;
    }
    if (!ev) {
      container.innerHTML = '<div class="lb-entry" style="justify-content:center;color:var(--muted);font-size:13px">📡 Nicht verfügbar (offline)</div>';
      return;
    }
  }

  container.innerHTML = '<div class="lb-entry" style="justify-content:center;color:var(--muted);font-size:13px">⏳ Lade Leaderboard…</div>';

  try {
    const rows = await getLeaderboard(ev.id, 10);

    const entries = rows.map(function(r) {
      return {
        name:  ((r.first_name || '').charAt(0) + '. ' + (r.last_name || '')).trim(),
        city:  r.city || '',
        score: r.best_score,
        level: r.max_level,
        isYou: !!(session.playerId && r.player_id === session.playerId),
      };
    });

    const localInTop = entries.some(function(e) { return e.isYou; });
    if (!localInTop && state.score > 0) {
      entries.push({
        name:  'DU (diese Runde)',
        city:  '',
        score: state.score,
        level: state.maxLevelReached,
        isYou: true,
      });
    }

    container.innerHTML = '';

    if (entries.length === 0) {
      container.innerHTML = '<div class="lb-entry" style="justify-content:center;color:var(--muted);font-size:13px">Noch keine Einträge – sei der Erste!</div>';
      return;
    }

    entries.forEach(function(entry, idx) {
      const rank      = idx + 1;
      const el        = document.createElement('div');
      el.className    = 'lb-entry' + (entry.isYou ? ' you' : '');
      const rankClass = rank <= 3 ? ['top1', 'top2', 'top3'][rank - 1] : '';
      const rankIcon  = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank;
      const youBadge  = entry.isYou ? '<span class="you-badge">DU</span>' : '';
      const cityStr   = entry.city ? ` <span style="color:var(--muted);font-size:11px">${entry.city}</span>` : '';

      el.innerHTML =
        `<span class="lb-rank ${rankClass}">${rankIcon}</span>` +
        `<span class="lb-name">${entry.name}${cityStr}${youBadge}</span>` +
        `<span class="lb-score">${entry.score.toLocaleString('de-DE')}</span>`;

      container.appendChild(el);

      el.style.opacity   = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(function() {
        el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        el.style.opacity    = '1';
        el.style.transform  = 'translateX(0)';
      }, idx * 60 + 100);
    });

  } catch (err) {
    console.warn('[LEAP] Leaderboard load failed:', err.message);
    container.innerHTML = '<div class="lb-entry" style="justify-content:center;color:var(--muted);font-size:13px">⚠️ Leaderboard konnte nicht geladen werden</div>';
  }
}

// ═══════════════════════════════════════════════════════════
// RESTART / SHARE
// ═══════════════════════════════════════════════════════════
function goHome() {
  showScreen('screen-start');
  resetGameState();
}

function playAgainDirect() {
  resetGameState();
  showScreen('screen-game');
  runCountdown();
}

function restartGame() {
  goHome();
}

function showShareModal() {
  document.getElementById('share-text-box').textContent = buildShareText();
  document.getElementById('share-modal').classList.remove('hidden');
}
function closeShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}
function copyShareText() {
  const text = document.getElementById('share-text-box').textContent;
  navigator.clipboard?.writeText(text).then(() => {
    const btn  = document.querySelector('#share-modal .btn-primary');
    const orig = btn.textContent;
    btn.textContent = '✅ Kopiert!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {
    const el = document.getElementById('share-text-box');
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
}
function buildShareText() {
  const levelNames = ['', 'Warm-Up', 'Charge', 'Boost', 'OVERTAKE'];
  const lvlLabel   = state.maxLevelReached >= 5 ? 'OVERTAKE' : (levelNames[state.maxLevelReached] || '');
  return `🏓⚡🚗 LEAPMOTOR TT CHALLENGE

Score:    ${state.score.toLocaleString('de-DE')} Punkte
Blöcke:   ${state.hits} zerstört · Max Combo ×${state.maxCombo}
Batterie: ${Math.round(state.energy)}% · Wellen: ${state.wavesCleared}
Level:    ${state.maxLevelReached} (${lvlLabel})${state.ghostOvertaken ? ' · 🏁 OVERTAKE!' : ''}

Kannst du meinen Leapmotor-Score schlagen?
#LeapMotor #TTChallenge #Tischtennis #EMobility`;
}

// ═══════════════════════════════════════════════════════════
// CAR BLOCK ICON
// ═══════════════════════════════════════════════════════════
function drawCarBlock(bx, by, bw, bh) {
  const cx   = bx + bw / 2;
  const cy   = by + bh / 2;
  const half = Math.min(bw * 0.32, bh * 0.42);
  const hh   = half * 0.55;

  ctx.save();
  ctx.fillStyle    = '#FFFFFF';
  ctx.globalAlpha  = 0.9;
  ctx.shadowColor  = 'rgba(255,255,255,0.5)';
  ctx.shadowBlur   = 4;

  const bodyTop = cy - hh * 0.22;
  const bodyH   = hh * 1.1;
  roundRect(ctx, cx - half, bodyTop, half * 2, bodyH, 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - half * 0.64, bodyTop);
  ctx.lineTo(cx - half * 0.38, cy - hh);
  ctx.lineTo(cx + half * 0.42, cy - hh);
  ctx.lineTo(cx + half * 0.64, bodyTop);
  ctx.closePath();
  ctx.fill();

  const wr = hh * 0.36;
  ctx.globalAlpha = 0.65;
  ctx.fillStyle   = 'rgba(0,0,0,0.88)';
  ctx.beginPath(); ctx.arc(cx - half * 0.58, bodyTop + bodyH, wr, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + half * 0.58, bodyTop + bodyH, wr, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// CANVAS DRAWING UTILITIES
// ═══════════════════════════════════════════════════════════
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x, y + h - r,     r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x,     y,     x + r, y,          r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ═══════════════════════════════════════════════════════════
// GENERAL UTILITIES
// ═══════════════════════════════════════════════════════════
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function animateCountUp(id, from, to, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  const diff  = to - from;
  (function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + diff * e).toLocaleString('de-DE');
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

function generateClaimCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ═══════════════════════════════════════════════════════════
// VEHICLE SPRITE — Canvas-drawn vector silhouettes
// PNG assets no longer used; all 4 models drawn via Canvas paths.
// ═══════════════════════════════════════════════════════════
const VEHICLE_KEYS = ['t03', 'b05', 'b10', 'c10'];
const vehicleSprites = {}; // preloaded Image objects, keyed by VEHICLE_KEYS

// ─── Vehicle shape parameters (unitless, scaled to fit block) ───────────────
// Each entry describes the silhouette proportions:
//   bodyAspect : width/height of the main body (higher = wider/longer)
//   roofFrac   : roof width as fraction of body width
//   roofHeight : roof height as fraction of body height
//   roofOffsetX: horizontal offset of roof centre from body centre (fraction of body w)
//   wheelSzFrac: wheel radius as fraction of body height
const VEHICLE_SHAPES = {
  t03: { bodyAspect: 1.55, roofFrac: 0.52, roofHeight: 0.52, roofOffsetX: -0.05, wheelSzFrac: 0.34, label: 'T03'  },
  b05: { bodyAspect: 1.70, roofFrac: 0.50, roofHeight: 0.45, roofOffsetX: -0.03, wheelSzFrac: 0.36, label: 'B05'  },
  b10: { bodyAspect: 1.88, roofFrac: 0.52, roofHeight: 0.42, roofOffsetX:  0.00, wheelSzFrac: 0.37, label: 'B10'  },
  c10: { bodyAspect: 2.05, roofFrac: 0.54, roofHeight: 0.40, roofOffsetX:  0.02, wheelSzFrac: 0.38, label: 'C10'  },
};

/**
 * Draw a parameterised Leapmotor-style car silhouette on the canvas block.
 * White body with #67C23A accent, black wheels. Minimalist flat look.
 * Model label drawn as small badge at bottom-centre.
 *
 * @param {number} bx      Block x (CSS px)
 * @param {number} by      Block y (CSS px)
 * @param {number} bw      Block width
 * @param {number} bh      Block height
 * @param {string} spriteKey  One of VEHICLE_KEYS
 */
function drawVehicleSprite(bx, by, bw, bh, spriteKey) {
  const cx  = bx + bw / 2;

  // ── PNG path: use real KI-render when loaded ────────────────────────────
  const img = vehicleSprites[spriteKey];
  if (img && img.loaded) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Dark block background (blends with black PNG background seamlessly)
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(bx, by, bw, bh);

    // Contain PNG (1536×1024 = 1.5:1 aspect) with 6% inset padding
    const pad = Math.round(Math.min(bw, bh) * 0.06);
    const drawW = bw - pad * 2;
    const drawH = bh - pad * 2;
    const imgAspect = 1536 / 1024; // 1.5
    let renderW, renderH;
    if (drawW / drawH > imgAspect) {
      renderH = drawH;
      renderW = renderH * imgAspect;
    } else {
      renderW = drawW;
      renderH = renderW / imgAspect;
    }
    const renderX = bx + (bw - renderW) / 2;
    const renderY = by + (bh - renderH) / 2;
    ctx.drawImage(img, renderX, renderY, renderW, renderH);

    // Green border around block
    ctx.strokeStyle = '#67C23A';
    ctx.lineWidth   = 2;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);

    // Model label at bottom-centre
    const labelFontSz = Math.max(7, Math.round(bh * 0.20));
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = `800 ${labelFontSz}px 'Montserrat', sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor  = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur   = 4;
    ctx.fillText(spriteKey.toUpperCase(), cx, by + bh - 2);

    ctx.restore();
    return;
  }

  // ── Fallback: parametrised vector silhouette (until PNG loads) ────────────
  const shape = VEHICLE_SHAPES[spriteKey] || VEHICLE_SHAPES.b05;

  // ── Contain silhouette in block with aspect ~shape.bodyAspect : 1 ──────────
  const pad   = Math.max(2, Math.round(Math.min(bw, bh) * 0.07));
  const maxW  = bw - pad * 2;
  const maxH  = bh - pad * 2 - Math.max(6, bh * 0.22); // reserve room for label

  // target size
  let carW, carH;
  if (maxW / maxH > shape.bodyAspect) {
    carH = maxH;
    carW = carH * shape.bodyAspect;
  } else {
    carW = maxW;
    carH = carW / shape.bodyAspect;
  }

  // cx already defined at top of function (bx + bw/2)
  const carY = by + pad + (maxH - carH) / 2; // vertically centred in reserved area

  // ── Geometry ────────────────────────────────────────────────────────────────
  const bodyLeft  = cx - carW / 2;
  const bodyTop   = carY + carH * 0.38;   // body fills lower ~62% of carH
  const bodyH     = carH * 0.58;
  const bodyRight = bodyLeft + carW;
  const bodyBot   = bodyTop + bodyH;

  const roofW     = carW * shape.roofFrac;
  const roofH     = bodyH * shape.roofHeight;
  const roofCX    = cx + carW * shape.roofOffsetX;
  const roofLeft  = roofCX - roofW / 2;
  const roofRight = roofCX + roofW / 2;
  const roofTop   = bodyTop - roofH;

  const wR = bodyH * shape.wheelSzFrac;  // wheel radius
  const wY = bodyBot;                     // wheel centre y
  const wLX = bodyLeft  + carW * 0.22;   // left wheel x
  const wRX = bodyRight - carW * 0.22;   // right wheel x

  ctx.save();

  // ── 1. Body (white) ─────────────────────────────────────────────────────────
  ctx.fillStyle  = '#FFFFFF';
  ctx.globalAlpha = 0.95;
  ctx.shadowColor = 'rgba(255,255,255,0.3)';
  ctx.shadowBlur  = 3;

  // Main body rectangle with rounded ends
  roundRect(ctx, bodyLeft, bodyTop, carW, bodyH - wR * 0.4, 3);
  ctx.fill();

  // ── 2. Roof cabin ───────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(roofLeft  + roofW * 0.10, bodyTop);
  ctx.lineTo(roofLeft  + roofW * 0.18, roofTop + roofH * 0.15);
  ctx.quadraticCurveTo(roofLeft + roofW * 0.22, roofTop, roofLeft + roofW * 0.30, roofTop);
  ctx.lineTo(roofRight - roofW * 0.30, roofTop);
  ctx.quadraticCurveTo(roofRight - roofW * 0.22, roofTop, roofRight - roofW * 0.18, roofTop + roofH * 0.15);
  ctx.lineTo(roofRight - roofW * 0.10, bodyTop);
  ctx.closePath();
  ctx.fill();

  // ── 3. Green accent stripe along bottom of body ─────────────────────────────
  ctx.shadowBlur = 0;
  ctx.fillStyle  = '#67C23A';
  ctx.globalAlpha = 0.92;
  const stripeH = Math.max(2, bodyH * 0.14);
  roundRect(ctx, bodyLeft + 2, bodyBot - wR * 0.4 - stripeH, carW - 4, stripeH, 1);
  ctx.fill();

  // ── 4. Windscreen (dark tint) ────────────────────────────────────────────────
  ctx.fillStyle  = 'rgba(10,30,10,0.78)';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  const wsL = roofLeft  + roofW * 0.15;
  const wsR = roofRight - roofW * 0.15;
  const wsT = roofTop   + roofH * 0.22;
  const wsB = bodyTop;
  ctx.moveTo(wsL + (wsR - wsL) * 0.08, wsT);
  ctx.lineTo(wsR - (wsR - wsL) * 0.08, wsT);
  ctx.lineTo(wsR - (wsR - wsL) * 0.04, wsB);
  ctx.lineTo(wsL + (wsR - wsL) * 0.04, wsB);
  ctx.closePath();
  ctx.fill();

  // ── 5. Green headlight strip (right side = front) ───────────────────────────
  ctx.fillStyle  = '#67C23A';
  ctx.globalAlpha = 0.90;
  ctx.shadowColor = '#67C23A';
  ctx.shadowBlur  = 5;
  const hlY = bodyTop + bodyH * 0.22;
  const hlH = Math.max(2, bodyH * 0.12);
  roundRect(ctx, bodyRight - carW * 0.10, hlY, carW * 0.10, hlH, 1);
  ctx.fill();

  // ── 6. Rear light (left side) — red ─────────────────────────────────────────
  ctx.fillStyle  = 'rgba(255,60,60,0.75)';
  ctx.shadowColor = 'rgba(255,60,60,0.6)';
  ctx.shadowBlur  = 4;
  roundRect(ctx, bodyLeft, hlY, carW * 0.07, hlH, 1);
  ctx.fill();

  // ── 7. Wheels ────────────────────────────────────────────────────────────────
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1.0;
  [wLX, wRX].forEach(function(wx) {
    // outer tyre
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(wx, wY, wR, 0, Math.PI * 2);
    ctx.fill();
    // rim highlight
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth   = Math.max(0.8, wR * 0.22);
    ctx.beginPath();
    ctx.arc(wx, wY, wR * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    // hub
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(wx, wY, wR * 0.20, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── 8. Model label badge at bottom-centre of block ──────────────────────────
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1.0;
  const labelFontSz = Math.max(7, Math.round(bh * 0.22));
  const labelY = by + bh - Math.max(4, bh * 0.10) - 1;
  ctx.fillStyle    = '#FFFFFF';
  ctx.font         = `800 ${labelFontSz}px 'Montserrat', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(shape.label, cx, labelY);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// INIT ON LOAD
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // Sync sound buttons with persisted state
  syncSoundButtons();

  // Resume AudioContext on first user interaction (autoplay policy)
  function resumeAudioOnce() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function() {});
    }
    document.removeEventListener('pointerdown', resumeAudioOnce);
    document.removeEventListener('touchstart',  resumeAudioOnce);
  }
  document.addEventListener('pointerdown', resumeAudioOnce, { once: true });
  document.addEventListener('touchstart',  resumeAudioOnce, { once: true, passive: true });

  // Preload vehicle PNG sprites
  VEHICLE_KEYS.forEach(function(key) {
    const img = new Image();
    img.onload  = function() { img.loaded = true; };
    img.onerror = function() { img.loaded = false; };
    img.src = 'assets/vehicles/' + key + '.png';
    vehicleSprites[key] = img;
  });
});
