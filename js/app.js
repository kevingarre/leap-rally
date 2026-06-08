/* ═══════════════════════════════════════════════════════════
   LEAP RALLY – Breakout Edition
   Leapmotor × Tischtennis × E-Mobility
   Mobile-first · No build step · No backend
═══════════════════════════════════════════════════════════ */

'use strict';

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const GAME_DURATION       = 30;
const MAX_ENERGY          = 100;
const TIMER_CIRCUMFERENCE = 163.4; // 2π × 26 (SVG ring)

// Block grid
const BLOCK_ROWS    = 4;
const BLOCK_COLS    = 6;
const BLOCK_GAP     = 5;   // px between blocks
const BLOCK_TOP_PAD = 18;  // px from top of canvas
const BLOCK_SIDE_PAD = 8;  // px from sides

// Energy reward per block row (row 0 = top; row 3 = nearest paddle = highest reward)
const BLOCK_ROW_ENERGY = [2, 3, 4, 5];
const BLOCK_COLORS = [
  '#39FF14', // green  – row 0 (top)
  '#00C8FF', // cyan   – row 1
  '#FFB800', // amber  – row 2
  '#FF5500', // orange – row 3 (bottom of block zone)
];

// Ball physics (fractions of canvas height per second)
const BALL_BASE_SPEED  = 0.42;
const BALL_MAX_SPEED   = 0.80;
const BALL_WAVE_ACCEL  = 1.06; // ×speed per wave cleared
const BALL_MIN_VY_FRAC = 0.30; // minimum vertical component fraction

// Paddle
const PADDLE_WIDTH_FRAC  = 0.28;  // fraction of canvas width
const PADDLE_HEIGHT      = 12;    // logical px
const PADDLE_BOTTOM_PAD  = 18;    // px from canvas bottom
const PADDLE_LERP_FACTOR = 14;    // lerp speed (multiplied by dt)

// FX
const PARTICLE_COUNT = 8;

// Fake leaderboard
const FAKE_LEADERBOARD = [
  { name: 'TigerSpin_DE',   score: 3840, energy: 100, blocks: 48 },
  { name: 'SpeedRacer22',   score: 3520, energy: 100, blocks: 42 },
  { name: 'ElectroBall',    score: 3280, energy: 98,  blocks: 38 },
  { name: 'PingPong_Pro',   score: 3010, energy: 92,  blocks: 34 },
  { name: 'LeapFan2025',    score: 2780, energy: 87,  blocks: 29 },
  { name: 'ChargeMaster',   score: 2490, energy: 79,  blocks: 26 },
  { name: 'RallyKing_MUC',  score: 2220, energy: 72,  blocks: 23 },
  { name: 'VoltSmasher',    score: 1950, energy: 66,  blocks: 19 },
  { name: 'E_Champ2025',    score: 1680, energy: 59,  blocks: 15 },
  { name: 'NewDriver',      score: 1300, energy: 48,  blocks: 10 },
];

// ═══════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════
let state = {
  currentScreen: 'screen-start',
  gameActive:    false,
  hits:          0,         // blocks destroyed
  energy:        0,
  combo:         1,
  maxCombo:      1,
  score:         0,
  timeLeft:      GAME_DURATION,
  wavesCleared:  0,
  gameInterval:  null,      // setInterval 1s timer
  rafId:         null,      // requestAnimationFrame id
  lastFrameTime: 0,
  ballSpeedPx:   0,         // actual pixel speed per second
};

// ═══════════════════════════════════════════════════════════
// CANVAS & GAME OBJECTS
// ═══════════════════════════════════════════════════════════
let canvas, ctx;
let cw = 0, ch = 0;        // logical canvas dimensions

const paddle = { x: 0, y: 0, w: 0, h: PADDLE_HEIGHT, targetX: 0 };
const ball   = { x: 0, y: 0, vx: 0, vy: 0, r: 0 };

let blocks      = [];  // { x, y, w, h, row, alive }
let particles   = [];  // { x, y, vx, vy, life, maxLife, color, size }
let floatTexts  = [];  // { x, y, vy, text, color, life, maxLife }

let ballLaunched  = false;
let ballMissFlash = 0;
let newWaveFlash  = 0;
let hintAlpha     = 1;   // "move paddle" hint fade

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
  clearInterval(state.gameInterval);

  Object.assign(state, {
    gameActive:    false,
    hits:          0,
    energy:        0,
    combo:         1,
    maxCombo:      1,
    score:         0,
    timeLeft:      GAME_DURATION,
    wavesCleared:  0,
    gameInterval:  null,
    rafId:         null,
    lastFrameTime: 0,
    ballSpeedPx:   0,
  });

  particles   = [];
  floatTexts  = [];
  ballLaunched  = false;
  ballMissFlash = 0;
  newWaveFlash  = 0;
  hintAlpha     = 1;

  // Reset HUD
  setEl('hit-count',     '0');
  setEl('timer-display', String(GAME_DURATION));
  setEl('combo-value',   '×1');
  setEl('battery-pct',   '0%');

  const fill = document.getElementById('battery-fill');
  if (fill) { fill.style.width = '0%'; fill.classList.remove('full'); }

  const spark = document.getElementById('spark-line');
  if (spark) spark.classList.remove('active');

  const comboEl = document.getElementById('combo-value');
  if (comboEl) comboEl.className = 'hud-value combo-val';

  const ringFill = document.getElementById('timer-ring-fill');
  if (ringFill) {
    ringFill.style.strokeDashoffset = '0';
    ringFill.style.stroke = 'var(--orange)';
  }
  document.getElementById('game-hud')?.classList.remove('timer-urgent');

  const carProgress = document.getElementById('car-progress');
  if (carProgress) carProgress.style.left = '8px';

  const numEl = document.getElementById('countdown-num');
  if (numEl) {
    numEl.textContent  = '3';
    numEl.style.color  = 'var(--orange)';
    numEl.style.filter = 'drop-shadow(0 0 30px var(--orange))';
  }
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
      void numEl.offsetHeight; // force reflow
      numEl.style.animation  = '';
      numEl.textContent      = countArr[i];
      if (i === countArr.length - 1) {
        numEl.style.color  = 'var(--green)';
        numEl.style.filter = 'drop-shadow(0 0 30px var(--green))';
      }
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

  // Touch controls (passive:false to allow preventDefault)
  canvas.addEventListener('touchstart',  onTouchInput, { passive: false });
  canvas.addEventListener('touchmove',   onTouchInput, { passive: false });

  // Pointer/mouse fallback for desktop testing
  canvas.addEventListener('pointermove', onPointerInput);
  canvas.addEventListener('pointerdown', onPointerInput);

  // Init game objects
  state.ballSpeedPx = BALL_BASE_SPEED * ch;
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
  paddle.w       = Math.round(cw * PADDLE_WIDTH_FRAC);
  paddle.h       = PADDLE_HEIGHT;
  paddle.x       = (cw - paddle.w) / 2;
  paddle.y       = ch - PADDLE_BOTTOM_PAD - PADDLE_HEIGHT;
  paddle.targetX = paddle.x;
}

function initBallObj() {
  ball.r = Math.max(8, Math.round(cw * 0.032));
  placeBallOnPaddle();
}

function placeBallOnPaddle() {
  ball.x  = paddle.x + paddle.w / 2;
  ball.y  = paddle.y - ball.r - 4;
  ball.vx = 0;
  ball.vy = 0;
}

function launchBall() {
  // Random upward angle: -80° ± 20° from horizontal
  const angleDeg = -80 + Math.random() * 20;
  const angleRad = angleDeg * (Math.PI / 180);
  const dir      = Math.random() > 0.5 ? 1 : -1;
  const spd      = state.ballSpeedPx;
  ball.vx = Math.cos(angleRad) * spd * dir;
  ball.vy = Math.sin(angleRad) * spd;   // negative = upward
  ballLaunched = true;
}

// ═══════════════════════════════════════════════════════════
// BLOCKS
// ═══════════════════════════════════════════════════════════
function initBlocks() {
  blocks = [];
  const usableW = cw - BLOCK_SIDE_PAD * 2;
  const blockW  = (usableW - BLOCK_GAP * (BLOCK_COLS - 1)) / BLOCK_COLS;
  const blockH  = Math.max(14, Math.round(ch * 0.055));

  for (let row = 0; row < BLOCK_ROWS; row++) {
    for (let col = 0; col < BLOCK_COLS; col++) {
      blocks.push({
        x:     BLOCK_SIDE_PAD + col * (blockW + BLOCK_GAP),
        y:     BLOCK_TOP_PAD  + row * (blockH + BLOCK_GAP),
        w:     blockW,
        h:     blockH,
        row,
        alive: true,
      });
    }
  }
}

function respawnBlocks() {
  state.wavesCleared++;
  state.ballSpeedPx = Math.min(
    state.ballSpeedPx * BALL_WAVE_ACCEL,
    BALL_MAX_SPEED * ch
  );
  newWaveFlash = 0.8;
  initBlocks();
  spawnFloatText(cw / 2, ch / 2, `⚡ WELLE ${state.wavesCleared + 1}!`, '#39FF14');
}

// ═══════════════════════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════════════════════
function beginGameLoop() {
  state.gameActive    = true;
  state.lastFrameTime = performance.now();

  // 1-second timer
  state.gameInterval = setInterval(gameTick, 1000);

  // Launch ball immediately
  launchBall();

  // Animation frame
  state.rafId = requestAnimationFrame(gameFrame);
}

function gameTick() {
  if (!state.gameActive) return;
  state.timeLeft = Math.max(0, state.timeLeft - 1);

  setEl('timer-display', String(state.timeLeft));

  const progress = state.timeLeft / GAME_DURATION;
  const offset   = TIMER_CIRCUMFERENCE * (1 - progress);
  const ringFill = document.getElementById('timer-ring-fill');
  if (ringFill) {
    ringFill.style.strokeDashoffset = offset.toFixed(1);
    if (state.timeLeft <= 10) {
      ringFill.style.stroke = '#FF2020';
      document.getElementById('game-hud')?.classList.add('timer-urgent');
    }
  }

  if (state.timeLeft <= 0) endGame();
}

function gameFrame(timestamp) {
  if (!state.gameActive) return;

  const dt = Math.min((timestamp - state.lastFrameTime) / 1000, 0.05); // cap at 50ms
  state.lastFrameTime = timestamp;

  update(dt);
  render();

  state.rafId = requestAnimationFrame(gameFrame);
}

// ═══════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════
function update(dt) {
  // Paddle follows touch/pointer
  const lerp = Math.min(1, PADDLE_LERP_FACTOR * dt);
  paddle.x += (paddle.targetX - paddle.x) * lerp;
  paddle.x  = Math.max(0, Math.min(cw - paddle.w, paddle.x));

  if (!ballLaunched) {
    // Sticky ball follows paddle before launch
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 4;
  } else {
    updateBall(dt);
  }

  // FX updates
  updateParticles(dt);
  updateFloatTexts(dt);

  if (ballMissFlash > 0) ballMissFlash = Math.max(0, ballMissFlash - dt * 2.5);
  if (newWaveFlash  > 0) newWaveFlash  = Math.max(0, newWaveFlash  - dt * 1.5);
  if (hintAlpha     > 0) hintAlpha     = Math.max(0, hintAlpha     - dt * 0.4);
}

function updateBall(dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Left / right walls
  if (ball.x - ball.r < 0) {
    ball.x  = ball.r;
    ball.vx = Math.abs(ball.vx);
  }
  if (ball.x + ball.r > cw) {
    ball.x  = cw - ball.r;
    ball.vx = -Math.abs(ball.vx);
  }

  // Top wall
  if (ball.y - ball.r < 0) {
    ball.y  = ball.r;
    ball.vy = Math.abs(ball.vy);
  }

  // Paddle collision (ball moving downward, overlapping paddle)
  if (ball.vy > 0 &&
      ball.y + ball.r >= paddle.y &&
      ball.y + ball.r <= paddle.y + paddle.h + Math.abs(ball.vy * dt * 2) &&
      ball.x > paddle.x - ball.r * 0.4 &&
      ball.x < paddle.x + paddle.w + ball.r * 0.4) {
    doBouncePaddle();
    return;
  }

  // Ball missed (fell below canvas)
  if (ball.y - ball.r > ch) {
    onBallMiss();
    return;
  }

  // Block collisions
  checkBlockCollisions();
}

function doBouncePaddle() {
  const hitFrac  = (ball.x - paddle.x) / paddle.w; // 0..1
  const norm     = hitFrac * 2 - 1;                 // -1..1
  const maxAngle = 62 * Math.PI / 180;
  const angle    = norm * maxAngle;
  const spd      = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

  ball.vx = Math.sin(angle) * spd;
  ball.vy = -Math.abs(Math.cos(angle) * spd);

  // Prevent near-horizontal shots
  const minVY = spd * BALL_MIN_VY_FRAC;
  if (Math.abs(ball.vy) < minVY) {
    ball.vy = -minVY;
    ball.vx = Math.sign(ball.vx) * Math.sqrt(Math.max(0, spd * spd - minVY * minVY));
  }

  // Push ball above paddle to avoid re-triggering
  ball.y = paddle.y - ball.r - 1;

  // Combo builds on paddle hits
  state.combo = Math.min(state.combo + 1, 5);
  if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  updateComboUI();

  hintAlpha = 0; // hide hint once player has controlled paddle
}

function onBallMiss() {
  state.combo = 1;
  updateComboUI();
  ballMissFlash = 0.5;
  ballLaunched  = false;
  placeBallOnPaddle();

  setTimeout(() => {
    if (!state.gameActive) return;
    launchBall();
  }, 700);
}

function checkBlockCollisions() {
  let aliveCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.alive) continue;
    aliveCount++;

    // Closest point on AABB to ball center
    const nearX = Math.max(b.x, Math.min(ball.x, b.x + b.w));
    const nearY = Math.max(b.y, Math.min(ball.y, b.y + b.h));
    const dx    = ball.x - nearX;
    const dy    = ball.y - nearY;

    if (dx * dx + dy * dy < ball.r * ball.r) {
      b.alive = false;
      aliveCount--;

      // Reflect on shortest overlap axis
      const overlapX = ball.r - Math.abs(dx);
      const overlapY = ball.r - Math.abs(dy);
      if (overlapX < overlapY) {
        ball.vx = -ball.vx;
        ball.x += Math.sign(dx || 1) * (overlapX + 1);
      } else {
        ball.vy = -ball.vy;
        ball.y += Math.sign(dy || -1) * (overlapY + 1);
      }

      // Energy & score
      const energyGain = BLOCK_ROW_ENERGY[b.row] * state.combo;
      const scoreGain  = BLOCK_ROW_ENERGY[b.row] * 10 * state.combo;
      state.energy  = Math.min(state.energy + energyGain, MAX_ENERGY);
      state.score  += scoreGain;
      state.hits++;

      setEl('hit-count', String(state.hits));
      updateEnergyUI();
      updateCarUI();

      // FX
      spawnParticles(b.x + b.w / 2, b.y + b.h / 2, BLOCK_COLORS[b.row]);
      const label = state.combo > 1 ? `+${energyGain}⚡ ×${state.combo}🔥` : `+${energyGain}⚡`;
      spawnFloatText(b.x + b.w / 2, b.y + b.h / 2, label, BLOCK_COLORS[b.row]);

      if (state.energy >= MAX_ENERGY) flashFullCharge();

      break; // one block per frame – prevents tunnelling artefacts
    }
  }

  if (aliveCount === 0) respawnBlocks();
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
    p.vy   += 260 * dt;  // gravity
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
  ctx.clearRect(0, 0, cw, ch);

  // Flash overlays
  if (ballMissFlash > 0) {
    ctx.fillStyle = `rgba(255,32,0,${ballMissFlash * 0.22})`;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (newWaveFlash > 0) {
    ctx.fillStyle = `rgba(57,255,20,${newWaveFlash * 0.18})`;
    ctx.fillRect(0, 0, cw, ch);
  }

  renderBlocks();
  renderParticles();
  renderPaddle();
  renderBall();
  renderFloatTexts();
  if (hintAlpha > 0) renderHint();
}

function renderBlocks() {
  for (const b of blocks) {
    if (!b.alive) continue;
    const color = BLOCK_COLORS[b.row];
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = 7;
    roundRect(ctx, b.x, b.y, b.w, b.h, 4);
    ctx.fillStyle = hexToRgba(color, 0.82);
    ctx.fill();
    // highlight stripe
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, 3, 1.5);
    ctx.fill();
    ctx.restore();
  }
}

function renderPaddle() {
  ctx.save();
  ctx.shadowColor = '#FF5500';
  ctx.shadowBlur  = 18;

  const g = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  g.addColorStop(0, '#FF8040');
  g.addColorStop(1, '#CC2200');

  roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, paddle.h / 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, paddle.x + 5, paddle.y + 2, paddle.w - 10, 4, 2);
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
  g.addColorStop(0,    '#FFFFFF');
  g.addColorStop(0.4,  '#F5E642');
  g.addColorStop(1,    '#C49A00');

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Ping-pong seam
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth   = 1.2;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r * 0.68, 0.15, Math.PI - 0.15);
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
    ctx.font         = `700 ${fontSize}px 'Orbitron', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
}

function renderHint() {
  const hintY    = ch - PADDLE_BOTTOM_PAD - PADDLE_HEIGHT - ball.r - 28;
  const fontSize = Math.max(9, Math.round(cw * 0.033));
  ctx.save();
  ctx.globalAlpha  = hintAlpha * 0.7;
  ctx.fillStyle    = '#FFFFFF';
  ctx.font         = `600 ${fontSize}px 'Inter', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('← Schläger bewegen →', cw / 2, hintY);
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
        `linear-gradient(90deg, var(--orange), var(--blue) ${pct}%, var(--green))`;
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
  const track   = document.querySelector('.car-track');
  const trackW  = track ? track.offsetWidth : 200;
  carProgress.style.left = `${8 + pct * (trackW - 50 - 36)}px`;

  const carEl = document.getElementById('game-car');
  if (carEl) {
    const glow = Math.round(pct * 28);
    carEl.style.filter = `drop-shadow(0 2px ${glow}px rgba(255,85,0,${pct * 0.8}))`;
  }
  const exhaust = document.getElementById('car-exhaust');
  if (exhaust) {
    exhaust.classList.add('active');
    setTimeout(() => exhaust.classList.remove('active'), 400);
  }
}

function flashFullCharge() {
  newWaveFlash = Math.max(newWaveFlash, 0.6);
  document.getElementById('battery-pct').textContent = '100% ⚡';
}

// ═══════════════════════════════════════════════════════════
// INPUT HANDLERS
// ═══════════════════════════════════════════════════════════
function onTouchInput(e) {
  e.preventDefault();
  if (!state.gameActive || !e.touches.length) return;
  const touch  = e.touches[0];
  const rect   = canvas.getBoundingClientRect();
  paddle.targetX = (touch.clientX - rect.left) - paddle.w / 2;
}

function onPointerInput(e) {
  if (!state.gameActive) return;
  const rect     = canvas.getBoundingClientRect();
  paddle.targetX = (e.clientX - rect.left) - paddle.w / 2;
}

// ═══════════════════════════════════════════════════════════
// END GAME
// ═══════════════════════════════════════════════════════════
function endGame() {
  cancelAnimationFrame(state.rafId);
  clearInterval(state.gameInterval);
  state.gameActive = false;

  const energyPct = Math.round(state.energy);
  state.score = Math.round(
    state.hits          * 18 +
    (state.maxCombo - 1) * state.hits * 8 +
    energyPct           * 12 +
    state.wavesCleared  * 250
  );

  setTimeout(() => {
    showScreen('screen-end');
    populateEndScreen(energyPct);
  }, 600);
}

function populateEndScreen(energyPct) {
  setEl('res-hits',   String(state.hits));
  setEl('res-combo',  `×${state.maxCombo}`);
  setEl('res-energy', `${energyPct}%`);
  setEl('res-score',  state.score.toLocaleString('de-DE'));
  setEl('res-waves',  String(state.wavesCleared));

  let title, sub;
  if (energyPct >= 100) {
    title = 'VOLLGELADEN! ⚡';
    sub   = 'Perfekte Aufladung – Leapmotor ready to race!';
  } else if (energyPct >= 75) {
    title = 'FAST AM ZIEL!';
    sub   = `${energyPct}% Energie – starke Leistung!`;
  } else if (energyPct >= 40) {
    title = 'GUTES TEMPO!';
    sub   = `${energyPct}% Batterie – nächstes Mal schaffst du es!`;
  } else {
    title = 'WEITER ÜBEN!';
    sub   = `${energyPct}% – Halte den Ball länger im Spiel!`;
  }
  setEl('end-title', title);
  setEl('end-sub',   sub);

  const trophy = document.getElementById('end-trophy');
  if (trophy) trophy.textContent = energyPct >= 100 ? '🏆' : energyPct >= 75 ? '🥈' : '🏓';

  buildLeaderboard(state.score, energyPct);
  animateCountUp('res-score', 0, state.score, 1200);
}

function buildLeaderboard(playerScore, playerEnergy) {
  const playerEntry = {
    name:   'DU',
    score:  playerScore,
    energy: Math.round(playerEnergy),
    blocks: state.hits,
    isYou:  true,
  };

  const entries = [
    ...FAKE_LEADERBOARD.map(e => ({ ...e, isYou: false })),
    playerEntry,
  ].sort((a, b) => b.score - a.score).slice(0, 12);

  const container = document.getElementById('lb-entries');
  if (!container) return;
  container.innerHTML = '';

  entries.forEach((entry, idx) => {
    const rank      = idx + 1;
    const el        = document.createElement('div');
    el.className    = 'lb-entry' + (entry.isYou ? ' you' : '');
    const rankClass = rank <= 3 ? ['top1', 'top2', 'top3'][rank - 1] : '';
    const rankIcon  = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1]       : rank;
    const nameBadge = entry.isYou ? '<span class="you-badge">YOU</span>' : '';

    el.innerHTML = `
      <span class="lb-rank ${rankClass}">${rankIcon}</span>
      <span class="lb-name">${entry.name}${nameBadge}</span>
      <span class="lb-energy">${entry.energy}%⚡</span>
      <span class="lb-score">${entry.score.toLocaleString('de-DE')}</span>
    `;
    container.appendChild(el);

    el.style.opacity   = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      el.style.opacity    = '1';
      el.style.transform  = 'translateX(0)';
    }, idx * 60 + 200);
  });
}

// ═══════════════════════════════════════════════════════════
// RESTART / SHARE
// ═══════════════════════════════════════════════════════════
function restartGame() {
  showScreen('screen-start');
  resetGameState();
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
  return `🏓⚡🚗 LEAP RALLY – Breakout Edition

Score:   ${state.score.toLocaleString('de-DE')} Punkte
Blöcke:  ${state.hits} zerstört · Max Combo ×${state.maxCombo}
Batterie: ${Math.round(state.energy)}% · Wellen: ${state.wavesCleared}

Kannst du meinen Score schlagen?
#LeapMotor #LeapRally #EMobility`;
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
    const p  = Math.min((now - start) / duration, 1);
    const e  = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = Math.round(from + diff * e).toLocaleString('de-DE');
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

// ═══════════════════════════════════════════════════════════
// GLOBAL EVENT HANDLERS
// ═══════════════════════════════════════════════════════════

// Prevent scroll during gameplay
document.addEventListener('touchmove', (e) => {
  if (state.gameActive) e.preventDefault();
}, { passive: false });

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('screen-start').classList.add('active');
});
