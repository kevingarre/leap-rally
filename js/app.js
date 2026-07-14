/* ═══════════════════════════════════════════════════════════
   LEAP CHARGE – Breakout Edition  v20260714f
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
const BALL_BASE_SPEED  = 0.38;
const BALL_MAX_SPEED   = 1.15;  // Bonus level can go faster
const BALL_WAVE_ACCEL  = 1.06;
const BALL_MIN_VY_FRAC = 0.30;

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
  { rows: 2, cols: 6, turboCount: 0, carRows: [1] },
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
  gamepaused:      false,
  // Multi-ball (Level 4)
  multiBallActive: false,
  multiBallTimer:  0,
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
  resetGameState();
  showScreen('screen-game');
  runCountdown();
}

function resetGameState() {
  cancelAnimationFrame(state.rafId);
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
    lives:            MAX_LIVES,
    level:            1,
    maxLevelReached:  1,
    bonusMode:        false,
    bonusWave:        0,
    ghostOvertaken:   false,
    ghostTrackPos:    0.65,
    instantWinTriggered: false,
    gamepaused:       false,
    multiBallActive:  false,
    multiBallTimer:   0,
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
    numEl.style.color  = 'var(--orange)';
    numEl.style.filter = 'drop-shadow(0 0 30px var(--orange))';
  }

  // Hide instant-win overlay if visible
  const iwOverlay = document.getElementById('instant-win-overlay');
  if (iwOverlay) iwOverlay.classList.add('hidden');
}

function runCountdown() {
  const overlay  = document.getElementById('countdown-overlay');
  const numEl    = document.getElementById('countdown-num');
  const countArr = ['3', '2', '1', 'GO!'];
  let   i        = 0;

  overlay.classList.remove('hidden');
  numEl.textContent  = countArr[0];
  numEl.style.color  = 'var(--orange)';
  numEl.style.filter = 'drop-shadow(0 0 30px var(--orange))';

  const tick = setInterval(() => {
    i++;
    if (i >= countArr.length) {
      clearInterval(tick);
      overlay.classList.add('hidden');
      initCanvas();
      beginGameLoop();
    } else {
      numEl.style.animation = 'none';
      void numEl.offsetHeight;
      numEl.style.animation  = '';
      numEl.textContent      = countArr[i];
      if (i === countArr.length - 1) {
        numEl.style.color  = 'var(--green)';
        numEl.style.filter = 'drop-shadow(0 0 30px var(--green))';
      }
    }
  }, 650);
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

  state.ballSpeedPx = BALL_BASE_SPEED * ch * LEVEL_SPEED_MULT[0];
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
  const lvlIdx = state.bonusMode ? 3 : Math.max(0, Math.min(3, state.level - 1));
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
  if (state.level >= 4) {
    // Enter bonus mode
    enterBonusMode();
    return true;
  }
  state.level++;
  if (state.level > state.maxLevelReached) state.maxLevelReached = state.level;

  const lvlIdx = state.level - 1;
  state.ballSpeedPx = Math.min(
    BALL_BASE_SPEED * ch * LEVEL_SPEED_MULT[lvlIdx],
    BALL_MAX_SPEED * ch
  );

  // Update paddle width, keep horizontally centred
  const frac = LEVEL_PADDLE_FRAC[lvlIdx];
  const newW = Math.max(PADDLE_MIN_PX, Math.round(cw * frac));
  paddle.x   = paddle.x + paddle.w / 2 - newW / 2;
  paddle.w   = newW;
  paddle.x   = Math.max(0, Math.min(cw - paddle.w, paddle.x));
  paddle.targetX = paddle.x;

  // CRITICAL: reset ball cleanly to paddle — prevents Level-4 auto-score bug
  resetBallToPaddle();
  deactivateBall2();

  levelOverlay = { active: true, timer: LEVEL_OVERLAY_DURATION, level: state.level, label: getLevelLabel(state.level) };

  triggerScreenShake(8, 0.45);
  playLevelUpTone(state.level);
  updateLevelHUD();
  spawnFloatText(cw / 2, ch * 0.35, `⚡ LEVEL ${state.level}!`, '#67C23A');

  if (state.level === 4) {
    spawnFloatText(cw / 2, ch * 0.45, '🔴 MULTI-BALL BEREIT', '#FF4D51');
  }

  return true;
}

function enterBonusMode() {
  if (state.bonusMode) {
    // Already in bonus: just increment wave, speed up
    state.bonusWave++;
    const mult = Math.min(
      BONUS_LEVEL_MAX_SPEED_MULT,
      Math.pow(BONUS_LEVEL_SPEED_MULT, state.bonusWave)
    );
    state.ballSpeedPx = Math.min(
      BALL_BASE_SPEED * ch * LEVEL_SPEED_MULT[3] * mult,
      BALL_MAX_SPEED * ch
    );
  } else {
    state.bonusMode  = true;
    state.bonusWave  = 1;
    state.ballSpeedPx = Math.min(
      BALL_BASE_SPEED * ch * LEVEL_SPEED_MULT[3] * BONUS_LEVEL_SPEED_MULT,
      BALL_MAX_SPEED * ch
    );
    spawnFloatText(cw / 2, ch * 0.28, '🏆 BONUS-MODE!', '#67C23A');
    spawnFloatText(cw / 2, ch * 0.38, 'JAGE DEN HIGHSCORE!', '#FFFFFF');
  }

  // Reset ball cleanly
  resetBallToPaddle();
  deactivateBall2();

  levelOverlay = { active: true, timer: LEVEL_OVERLAY_DURATION, level: 4, label: `BONUS WELLE ${state.bonusWave}` };
  triggerScreenShake(6, 0.35);
  updateLevelHUD();
}

function getLevelLabel(lvl) {
  const labels = ['', 'WARM-UP', 'CHARGE', 'BOOST', 'OVERTAKE'];
  return labels[Math.min(lvl, 4)] || '';
}

function updateLevelHUD() {
  const badge = document.getElementById('level-badge');
  if (!badge) return;
  if (state.bonusMode) {
    badge.textContent = `BONUS W${state.bonusWave}`;
    badge.className   = 'level-badge level-4 bonus';
  } else {
    badge.textContent = `LVL ${state.level}`;
    badge.className   = `level-badge level-${state.level}`;
  }
}

function updateLivesHUD() {
  const el = document.getElementById('lives-display');
  if (!el) return;
  let html = '';
  for (let i = 0; i < MAX_LIVES; i++) {
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

  let idx = 0;
  for (let row = 0; row < rows; row++) {
    const isCarRow = cfg.carRows.includes(row);
    const carCol   = (row * 2 + 1) % cols;
    for (let col = 0; col < cols; col++) {
      const isTurbo  = turboIndices.has(idx);
      const isCar    = isCarRow && col === carCol;
      const hitsLeft = (isCar && state.level >= 3) ? 2 : 1;
      blocks.push({
        x:         BLOCK_SIDE_PAD + col * (blockW + BLOCK_GAP),
        y:         BLOCK_TOP_PAD  + row * (blockH + BLOCK_GAP),
        w:         blockW,
        h:         blockH,
        row,
        alive:     true,
        carTarget: isCar,
        isTurbo,
        hitsLeft,
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
    BALL_MAX_SPEED * ch
  );

  newWaveFlash = 0.8;

  if (state.bonusMode) {
    enterBonusMode();
  } else {
    // Build blocks for next level (or current level's new wave)
    tryLevelUp();
  }

  initBlocks();
  if (!state.bonusMode) {
    spawnFloatText(cw / 2, ch / 2, `⚡ WELLE ${state.wavesCleared + 1}!`, '#67C23A');
  }
}

// ═══════════════════════════════════════════════════════════
// MULTI-BALL
// ═══════════════════════════════════════════════════════════
function spawnBall2() {
  if (ball2.active || state.level < 4) return;
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

  spawnFloatText(cw / 2, ch * 0.3, '🔴 MULTI-BALL!', '#FF4D51');
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
  const lvlIdx = state.bonusMode ? 3 : Math.min(state.level - 1, 3);
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
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return audioCtx;
}

function playTone(freq, type, gain, duration) {
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

  // Launch ball immediately
  launchBall();

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
    updateBall2(dt);
    state.multiBallTimer -= dt;
    if (state.multiBallTimer <= 0) {
      deactivateBall2();
      spawnFloatText(cw / 2, ch * 0.4, 'MULTI-BALL ENDE', '#FFB800');
    }
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
  if (hintAlpha      > 0) hintAlpha      = Math.max(0, hintAlpha      - dt * 0.4);
  if (overtakeFlash  > 0) overtakeFlash  = Math.max(0, overtakeFlash  - dt);
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
    state.combo = Math.min(state.combo + 1, 5);
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    updateComboUI();
    if (state.combo >= 4) triggerScreenShake(4, 0.2);
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

  // Noch Leben übrig → Ball neu auf Paddle
  resetBallToPaddle();
  spawnFloatText(cw / 2, ch * 0.5, `❤️ ${state.lives} LEBEN`, '#FF4D51');

  setTimeout(() => {
    if (!state.gameActive || state.gamepaused) return;
    launchBall();
  }, 600);
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
      if (blk.hitsLeft > 0) {
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
        spawnFloatText(blk.x + blk.w / 2, blk.y, '💥 -1 HIT', '#FFB800');
        break;
      }

      blk.alive = false;
      aliveCount--;

      const overlapX = b.r - Math.abs(dx);
      const overlapY = b.r - Math.abs(dy);
      if (overlapX < overlapY) {
        b.vx = -b.vx;
        b.x += Math.sign(dx || 1) * (overlapX + 1);
      } else {
        b.vy = -b.vy;
        b.y += Math.sign(dy || -1) * (overlapY + 1);
      }

      let energyGain, scoreGain;
      const baseEnergy = (BLOCK_ROW_ENERGY_BASE[Math.min(blk.row, 3)] || 3) * state.combo;
      const bonusMult  = state.bonusMode ? 1 + state.bonusWave * 0.15 : 1;
      if (blk.isTurbo) {
        energyGain = baseEnergy * 2 + 4;
        scoreGain  = Math.round((baseEnergy * 20 * state.combo + 180) * bonusMult);
      } else if (blk.carTarget) {
        energyGain = baseEnergy + CAR_TARGET_BONUS_ENERGY;
        scoreGain  = Math.round((baseEnergy * 10 * state.combo + CAR_TARGET_BONUS_SCORE) * bonusMult);
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
      if (blk.isTurbo) label = `⚡ TURBO +${energyGain}`;
      else if (blk.carTarget) label += ' · 🚗 BONUS';
      spawnFloatText(blk.x + blk.w / 2, blk.y + blk.h / 2, label, blockColor);

      if (state.energy >= MAX_ENERGY && !state.fullChargeRewarded) {
        flashFullCharge();
        state.fullChargeRewarded = true;
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
  for (let i = 0; i < PARTICLE_COUNT; i++) {
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
      drawCarBlock(b.x, b.y, b.w, b.h);

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
// PADDLE REDESIGN: klarer Tischtennis-Schläger
// Rundes/ovales Blatt + kurzer Griff, weiß mit grünem Rand
// ─────────────────────────────────────────────────────────
function renderPaddle() {
  const cx      = paddle.x + paddle.w / 2;
  const cy      = paddle.y + paddle.h / 2;

  // Proportions: blade is oval, handle below
  const bladeRX = paddle.w * 0.50;   // half-width of blade
  const bladeRY = paddle.h * 1.1;    // half-height of blade (slightly taller than logical height)
  const bladeCY = cy - paddle.h * 0.15;

  const handleW  = Math.max(7, paddle.w * 0.14);
  const handleH  = Math.max(12, paddle.h * 1.35);
  const handleX  = cx - handleW / 2;
  const handleY  = bladeCY + bladeRY * 0.55;

  ctx.save();

  // Green glow
  ctx.shadowColor = 'rgba(103,194,58,0.75)';
  ctx.shadowBlur  = 18;

  // Handle: dark rounded rect
  const hg = ctx.createLinearGradient(handleX, handleY, handleX, handleY + handleH);
  hg.addColorStop(0, '#2A2A2A');
  hg.addColorStop(1, '#111111');
  roundRect(ctx, handleX, handleY, handleW, handleH, handleW / 2.2);
  ctx.fillStyle = hg;
  ctx.fill();

  // Green grip wrap on handle
  ctx.strokeStyle = 'rgba(103,194,58,0.6)';
  ctx.lineWidth   = 1.5;
  for (let gy = handleY + 3; gy < handleY + handleH - 3; gy += 5) {
    ctx.beginPath();
    ctx.moveTo(handleX + 1, gy);
    ctx.lineTo(handleX + handleW - 1, gy + 2);
    ctx.stroke();
  }

  // Blade: white oval with green border
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.ellipse(cx, bladeCY, bladeRX, bladeRY, 0, 0, Math.PI * 2);

  const bg = ctx.createLinearGradient(cx, bladeCY - bladeRY, cx, bladeCY + bladeRY);
  bg.addColorStop(0,   '#FFFFFF');
  bg.addColorStop(0.5, '#F0F0F0');
  bg.addColorStop(1,   '#D8D8D8');
  ctx.fillStyle = bg;
  ctx.fill();

  // Green border
  ctx.strokeStyle = '#67C23A';
  ctx.lineWidth   = Math.max(2, paddle.w * 0.025);
  ctx.shadowColor = 'rgba(103,194,58,0.9)';
  ctx.shadowBlur  = 8;
  ctx.stroke();

  // Center line (horizontal seam on blade)
  ctx.shadowBlur   = 0;
  ctx.strokeStyle  = 'rgba(103,194,58,0.35)';
  ctx.lineWidth    = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - bladeRX * 0.85, bladeCY);
  ctx.lineTo(cx + bladeRX * 0.85, bladeCY);
  ctx.stroke();

  // Highlight glare
  ctx.beginPath();
  ctx.ellipse(cx - bladeRX * 0.25, bladeCY - bladeRY * 0.3, bladeRX * 0.28, bladeRY * 0.18, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fill();

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

  const timerFrac = state.multiBallTimer / MULTIBALL_DURATION;
  ctx.strokeStyle = `rgba(103,194,58,${0.4 + timerFrac * 0.5})`;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(ball2.x, ball2.y, ball2.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timerFrac);
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
  ctx.fillText('← Schläger bewegen · 🚗 Ziele treffen →', cw / 2, hintY);
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
  const titleText  = state.bonusMode ? `BONUS W${state.bonusWave}` : `LEVEL ${lvl}`;
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

function flashFullCharge() {
  state.score += FULL_CHARGE_BONUS_SCORE;
  state.fullChargeBonuses++;
  newWaveFlash = Math.max(newWaveFlash, 0.6);
  spawnFloatText(cw / 2, ch * 0.40, `⚡ TURBO-BOOST +${FULL_CHARGE_BONUS_SCORE}`, '#67C23A');

  const currentSpeed = Math.hypot(ball.vx, ball.vy) || state.ballSpeedPx;
  const turboSpeed   = Math.min(currentSpeed * 1.18, BALL_MAX_SPEED * ch);
  if (currentSpeed > 0) {
    const k = turboSpeed / currentSpeed;
    ball.vx *= k;
    ball.vy *= k;
  }
  state.ballSpeedPx = Math.min(state.ballSpeedPx * 1.12, BALL_MAX_SPEED * ch);

  if (state.level >= 4 && !ball2.active) {
    spawnBall2();
  }

  // Ghost-car overtake: trigger instant-win check
  triggerGhostOvertake();

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

  document.getElementById('battery-pct').textContent = '100% ⚡';
  triggerScreenShake(6, 0.4);
  playTone(880, 'sine', 0.25, 0.6);
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

function triggerGhostOvertake() {
  state.ghostOvertaken = true;

  // Only full drama + instant-win check once per game
  if (state.instantWinTriggered) return;

  // --- DRAMA: Gänsehaut-Moment ---
  startOvertakeDrama();

  // Check instant-win threshold AFTER drama
  const ev = window.LEAP_EVENT;
  if (!ev) return;

  const scoreThreshold = ev.instant_win_score || 1500;
  const ghostReq       = ev.instant_win_ghost_req !== false;
  const approxScore    = computeCurrentScore();

  if (approxScore >= scoreThreshold && (!ghostReq || state.ghostOvertaken)) {
    state.instantWinTriggered = true;
    // Wait for drama to finish, THEN pause for instant-win form
    const dramaMs = SLOWMO_DURATION * 1000 + 600; // slomo + brief hold
    setTimeout(() => {
      if (!state.gameActive) return;
      pauseForInstantWin();
    }, dramaMs);
  }
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
  const colors = ['#67C23A', '#95D475', '#FFFFFF', '#FFB800', '#67C23A'];
  for (let i = 0; i < 40; i++) {
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

function playOvertakeTone() {
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

  // Store preliminary score for form
  const energyPct  = Math.round(state.energy);
  const durationS  = session.gameStartTs
    ? Math.round((Date.now() - session.gameStartTs) / 1000)
    : 0;

  const liveScore = computeCurrentScore();
  const ev        = window.LEAP_EVENT;

  session.pendingScore = {
    event_id:        ev ? ev.id : null,
    score:           liveScore,
    level_reached:   state.maxLevelReached,
    ghost_overtaken: true,
    play_duration_s: durationS,
    is_instant_win:  true,
  };
  if (!session.pendingScore.event_id) delete session.pendingScore.event_id;

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
    // Wire up the "Weiterspielen" button (before form submit)
    const skipBtn = document.getElementById('iwo-skip-btn');
    if (skipBtn) {
      skipBtn.onclick = () => {
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
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function resumeAfterInstantWin(codeShown) {
  // Resume game loop
  state.gamepaused    = false;
  state.lastFrameTime = performance.now();
  state.rafId         = requestAnimationFrame(gameFrame);

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
  if (!v('gfi-vehicle')) { errors.push('Wunschmodell auswählen.');   document.getElementById('gfi-vehicle').classList.add('error'); }
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
  if (!playerData.event_id) delete playerData.event_id;

  _doGameOptinSubmit(playerData, submitBtn, errorEl);
}

async function _doGameOptinSubmit(playerData, submitBtn, errorEl) {
  try {
    const ps  = session.pendingScore || {};
    const ev3 = window.LEAP_EVENT;
    const result = await submitEntry({
      event_id:         ev3 ? ev3.id : (ps.event_id || undefined),
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
}

function onPointerInput(e) {
  if (!state.gameActive || state.gamepaused) return;
  const rect     = canvas.getBoundingClientRect();
  paddle.targetX = (e.clientX - rect.left) - paddle.w / 2;
}

// ═══════════════════════════════════════════════════════════
// END GAME
// ═══════════════════════════════════════════════════════════
function endGame() {
  cancelAnimationFrame(state.rafId);
  state.gameActive  = false;
  state.gamepaused  = false;
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
    (state.bonusMode ? state.bonusWave * 200 : 0)
  );

  // Instant-win check for end-screen (fallback if not triggered mid-game)
  const ev = window.LEAP_EVENT;
  let isInstantWin = state.instantWinTriggered && session.submitted;
  if (!isInstantWin && ev) {
    const scoreThreshold = ev.instant_win_score || 1500;
    const ghostReq       = ev.instant_win_ghost_req !== false;
    isInstantWin = state.score >= scoreThreshold &&
                   (!ghostReq || state.ghostOvertaken);
  }

  const durationS = session.gameStartTs
    ? Math.round((Date.now() - session.gameStartTs) / 1000)
    : 60;

  if (!session.pendingScore || !session.submitted) {
    session.pendingScore = {
      event_id:        ev ? ev.id : null,
      score:           state.score,
      level_reached:   state.maxLevelReached,
      ghost_overtaken: state.ghostOvertaken,
      play_duration_s: durationS,
      is_instant_win:  isInstantWin,
    };
    if (!session.pendingScore.event_id) delete session.pendingScore.event_id;
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
  setEl('res-hits',   String(state.hits));
  setEl('res-combo',  `×${state.maxCombo}`);
  setEl('res-energy', `${energyPct}%`);
  setEl('res-score',  state.score.toLocaleString('de-DE'));
  setEl('res-waves',  String(state.wavesCleared));

  let title, sub;
  if (energyPct >= 100) {
    title = 'VOLLGELADEN! ⚡';
    sub   = 'Perfekte Aufladung – Leapmotor voll geladen, Turbo aktiv!';
  } else if (energyPct >= 75) {
    title = 'FAST VOLL!';
    sub   = `${energyPct}% Batterie – starke Tischtennis-Performance!`;
  } else if (energyPct >= 40) {
    title = 'GUTES TEMPO!';
    sub   = `${energyPct}% geladen – nächstes Spiel schaffst du 100%!`;
  } else {
    title = 'WEITER ÜBEN!';
    sub   = `${energyPct}% – Schlag mehr Blöcke, lade den Leapmotor auf!`;
  }
  const levelNames = ['', 'Warm-Up', 'Charge', 'Boost', 'OVERTAKE 🏆'];
  const lvlLabel   = state.bonusMode ? `BONUS W${state.bonusWave}` : (levelNames[state.maxLevelReached] || '');
  sub += ` · Level ${state.maxLevelReached} (${lvlLabel}) erreicht.`;
  if (state.ghostOvertaken) sub += ' 🚗 Ghost überholt!';

  setEl('end-title', title);
  setEl('end-sub',   sub);

  const trophy = document.getElementById('end-trophy');
  if (trophy) trophy.textContent = energyPct >= 100 ? '🏆' : energyPct >= 75 ? '🥈' : '🎯';

  const iwBanner = document.getElementById('instant-win-banner');
  if (iwBanner) {
    if (isInstantWin) {
      iwBanner.classList.remove('hidden');
      iwBanner.classList.add('win-active');
      // If already submitted (mid-game), show code directly
      if (session.submitted && session.instantWinCode) {
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

  const optinSection = document.getElementById('optin-section');
  if (optinSection) {
    if (session.submitted) {
      // Already submitted via mid-game form – collapse/hide to avoid re-submit
      optinSection.classList.add('hidden');
    } else {
      optinSection.classList.remove('hidden');
      optinSection.style.opacity      = '';
      optinSection.style.pointerEvents = '';
      const form    = document.getElementById('optin-form');
      if (form) form.reset();
      const errorEl = document.getElementById('optin-error');
      if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
      const submitBtn = document.getElementById('optin-submit-btn');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✅ ABSENDEN'; }
      if (isInstantWin) {
        setEl('optin-sub', '🎉 Gib deine Daten ein – danach siehst du deinen Sofort-Gewinn-Code!');
      } else {
        setEl('optin-sub', 'Hinterlasse deine Daten für das Leaderboard und deine Gewinnchance!');
      }
    }
  }

  animateCountUp('res-score', 0, state.score, 1200);
  buildLeaderboard();
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
  if (!v('fi-vehicle')) { errors.push('Wunschmodell auswählen.');            document.getElementById('fi-vehicle').classList.add('error'); }
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
  if (!playerData.event_id) delete playerData.event_id;

  _doOptinSubmit(playerData, submitBtn, errorEl);
}

async function _doOptinSubmit(playerData, submitBtn, errorEl) {
  try {
    const ps  = session.pendingScore || {};
    const ev3 = window.LEAP_EVENT;
    const result = await submitEntry({
      event_id:         ev3 ? ev3.id : (ps.event_id || undefined),
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
      session.instantWinCode = null;
    }

    session.submitted = true;

    submitBtn.textContent = '✅ Gespeichert!';
    submitBtn.disabled    = true;
    const optinSection = document.getElementById('optin-section');
    if (optinSection) {
      optinSection.style.opacity      = '0.5';
      optinSection.style.pointerEvents = 'none';
    }

    if (session.instantWinCode) {
      const iwCodeWrap = document.getElementById('iw-code-wrap');
      if (iwCodeWrap) {
        iwCodeWrap.classList.remove('hidden');
        setEl('iw-code', session.instantWinCode);
        iwCodeWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  const ev = window.LEAP_EVENT;
  if (!ev) {
    container.innerHTML = '<div class="lb-entry" style="justify-content:center;color:var(--muted);font-size:13px">📡 Leaderboard nicht verfügbar (offline)</div>';
    return;
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
  const lvlLabel   = state.bonusMode ? `BONUS W${state.bonusWave}` : (levelNames[state.maxLevelReached] || '');
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
