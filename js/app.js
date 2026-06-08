/* ═══════════════════════════════════════════════════════════
   LEAP RALLY – Game Logic
   Leapmotor × Tischtennis × E-Mobility
   Click Dummy / Event Activation Prototype
═══════════════════════════════════════════════════════════ */

'use strict';

// ── Constants ─────────────────────────────────────────────
const GAME_DURATION  = 30;     // seconds
const MAX_ENERGY     = 100;    // percent
const ENERGY_PER_TAP = 1.4;    // base energy per tap
const COMBO_TIMEOUT  = 700;    // ms without tap → reset combo
const COMBO_TRIGGER  = 300;    // ms between taps → combo builds
const MAX_COMBO      = 5;
const TIMER_CIRCUMFERENCE = 163.4; // 2π × 26

// Fake leaderboard data
const FAKE_LEADERBOARD = [
  { name: "TigerSpin_DE",   score: 2840, energy: 100 },
  { name: "SpeedRacer22",   score: 2720, energy: 100 },
  { name: "ElectroBall",    score: 2480, energy: 98  },
  { name: "PingPong_Pro",   score: 2310, energy: 92  },
  { name: "LeapFan2025",    score: 2180, energy: 87  },
  { name: "ChargeMaster",   score: 1990, energy: 79  },
  { name: "RallyKing_MUC",  score: 1820, energy: 72  },
  { name: "VoltSmasher",    score: 1650, energy: 66  },
  { name: "E_Champ2025",    score: 1480, energy: 59  },
  { name: "NewDriver",      score: 1200, energy: 48  },
];

// ── State ──────────────────────────────────────────────────
let state = {
  currentScreen: 'screen-start',
  gameActive:    false,
  hits:          0,
  energy:        0,
  combo:         1,
  maxCombo:      1,
  score:         0,
  timeLeft:      GAME_DURATION,
  lastTapTime:   0,
  comboTimer:    null,
  gameInterval:  null,
};

// ── Screen Navigation ──────────────────────────────────────
function showScreen(id) {
  const current = document.querySelector('.screen.active');
  const next    = document.getElementById(id);
  if (!next || current?.id === id) return;

  if (current) {
    current.classList.remove('active');
    current.classList.add('exit-left');
    setTimeout(() => current.classList.remove('exit-left'), 400);
  }

  requestAnimationFrame(() => {
    next.classList.add('active');
  });

  state.currentScreen = id;
}

// ── Countdown → Start ──────────────────────────────────────
function startGame() {
  resetGameState();
  showScreen('screen-game');

  const overlay  = document.getElementById('countdown-overlay');
  const numEl    = document.getElementById('countdown-num');
  const countArr = ['3', '2', '1', 'GO!'];
  let   i        = 0;

  overlay.classList.remove('hidden');
  numEl.textContent = countArr[i];

  const tick = setInterval(() => {
    i++;
    if (i >= countArr.length) {
      clearInterval(tick);
      overlay.classList.add('hidden');
      beginGameLoop();
      document.getElementById('tap-hint').classList.remove('hidden');
    } else {
      // Re-trigger animation
      numEl.style.animation = 'none';
      numEl.offsetHeight; // reflow
      numEl.style.animation = '';
      numEl.textContent = countArr[i];
      if (i === countArr.length - 1) {
        numEl.style.color = 'var(--green)';
        numEl.style.filter = 'drop-shadow(0 0 30px var(--green))';
      }
    }
  }, 900);
}

function resetGameState() {
  clearInterval(state.gameInterval);
  clearTimeout(state.comboTimer);
  state = {
    ...state,
    gameActive:   false,
    hits:         0,
    energy:       0,
    combo:        1,
    maxCombo:     1,
    score:        0,
    timeLeft:     GAME_DURATION,
    lastTapTime:  0,
    comboTimer:   null,
    gameInterval: null,
  };

  // Reset UI
  setEl('hit-count',    '0');
  setEl('timer-display', String(GAME_DURATION));
  setEl('combo-value',  '×1');
  setEl('battery-pct',  '0%');

  const fill = document.getElementById('battery-fill');
  fill.style.width = '0%';
  fill.classList.remove('full');

  const sparkLine = document.getElementById('spark-line');
  sparkLine.classList.remove('active');

  document.getElementById('combo-value').className = 'hud-value combo-val';

  const ringFill = document.getElementById('timer-ring-fill');
  ringFill.style.strokeDashoffset = '0';
  ringFill.style.stroke = 'var(--orange)';
  document.getElementById('game-hud').classList.remove('timer-urgent');

  const carProgress = document.getElementById('car-progress');
  carProgress.style.left = '8px';
  document.getElementById('car-exhaust').classList.remove('active');

  document.getElementById('tap-hint').textContent = 'TAP!';
  document.getElementById('floating-hits').innerHTML = '';
  document.getElementById('ripple-container').innerHTML = '';

  // Reset countdown overlay style
  const numEl = document.getElementById('countdown-num');
  numEl.style.color  = 'var(--orange)';
  numEl.style.filter = 'drop-shadow(0 0 30px var(--orange))';
}

function beginGameLoop() {
  state.gameActive = true;
  state.gameInterval = setInterval(gameTick, 1000);
}

function gameTick() {
  if (!state.gameActive) return;
  state.timeLeft--;

  // Update timer display
  setEl('timer-display', String(state.timeLeft));

  // Update ring
  const progress  = state.timeLeft / GAME_DURATION;
  const offset    = TIMER_CIRCUMFERENCE * (1 - progress);
  const ringFill  = document.getElementById('timer-ring-fill');
  ringFill.style.strokeDashoffset = offset.toFixed(1);

  // Urgency styling
  if (state.timeLeft <= 10) {
    ringFill.style.stroke = '#FF2020';
    document.getElementById('game-hud').classList.add('timer-urgent');
  }

  if (state.timeLeft <= 0) {
    endGame();
  }
}

// ── Tap Handler ────────────────────────────────────────────
function handleTap(event) {
  if (!state.gameActive) return;
  if (event) event.preventDefault();

  const now = Date.now();

  // Hide hint after first tap
  document.getElementById('tap-hint').classList.add('hidden');

  // ── Combo logic ────────────────────────────────────────
  const timeSinceLast = now - state.lastTapTime;
  state.lastTapTime = now;

  clearTimeout(state.comboTimer);

  if (timeSinceLast < COMBO_TRIGGER && state.lastTapTime > 0) {
    state.combo = Math.min(state.combo + 1, MAX_COMBO);
  }

  // Reset combo if no tap within window
  state.comboTimer = setTimeout(() => {
    state.combo = 1;
    updateComboUI();
  }, COMBO_TIMEOUT);

  if (state.combo > state.maxCombo) {
    state.maxCombo = state.combo;
  }

  // ── Energy & hits ──────────────────────────────────────
  state.hits++;
  const gained  = ENERGY_PER_TAP * (1 + (state.combo - 1) * 0.5);
  state.energy  = Math.min(state.energy + gained, MAX_ENERGY);

  // ── UI updates ─────────────────────────────────────────
  setEl('hit-count', String(state.hits));
  updateComboUI();
  updateEnergyUI();
  updateCarUI();
  spawnRipple();
  spawnFloatNum(state.combo);
  animateBall();

  // If fully charged mid-game
  if (state.energy >= MAX_ENERGY && state.gameActive) {
    flashFullCharge();
  }
}

function updateComboUI() {
  const el  = document.getElementById('combo-value');
  const hud = document.getElementById('game-hud');
  el.textContent = `×${state.combo}`;

  // Color classes
  el.className = 'hud-value combo-val';
  if (state.combo >= 5) el.classList.add('x5');
  else if (state.combo >= 4) el.classList.add('x4');
  else if (state.combo >= 3) el.classList.add('x3');
  else if (state.combo >= 2) el.classList.add('x2');

  // Combo burst effect
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

  fill.style.width = `${pct}%`;
  pctLabel.textContent = `${pct}%`;

  if (pct >= 100) {
    fill.classList.add('full');
    pctLabel.classList.add('full');
    spark.classList.remove('active');
  } else {
    // Color gradient based on charge
    if (pct > 60) {
      fill.style.background = `linear-gradient(90deg, var(--orange), var(--blue) ${pct}%, var(--green))`;
    }
    // Spark line follows fill edge
    const trackWidth = document.getElementById('battery-fill').parentElement.offsetWidth;
    const sparkLeft  = Math.max(0, (pct / 100) * trackWidth - 5);
    spark.style.left = `${sparkLeft}px`;
    spark.classList.add('active');
  }
}

function updateCarUI() {
  const pct         = state.energy / MAX_ENERGY;
  const carProgress = document.getElementById('car-progress');
  const track       = document.querySelector('.car-track');
  const trackWidth  = track.offsetWidth;
  const carWidth    = 50; // approx
  const maxLeft     = trackWidth - carWidth - 36; // leave space for flag
  const newLeft     = 8 + pct * maxLeft;

  carProgress.style.left = `${newLeft}px`;

  // Exhaust on movement
  const exhaust = document.getElementById('car-exhaust');
  if (state.hits > 0) {
    exhaust.classList.add('active');
    setTimeout(() => exhaust.classList.remove('active'), 500);
  }

  // Car glow level
  const carEl = document.getElementById('game-car');
  const glow  = Math.round(pct * 30);
  carEl.style.filter = `drop-shadow(0 2px ${glow}px rgba(255,85,0,${pct * 0.8}))`;
}

function spawnRipple() {
  const container = document.getElementById('ripple-container');
  const el = document.createElement('div');
  el.className = 'ripple';
  const size = 60 + Math.random() * 60;
  el.style.width  = `${size}px`;
  el.style.height = `${size}px`;

  // Slight random offset
  const ox = (Math.random() - 0.5) * 20;
  const oy = (Math.random() - 0.5) * 20;
  el.style.marginLeft = `${ox}px`;
  el.style.marginTop  = `${oy}px`;

  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function animateBall() {
  const ball = document.getElementById('tap-ball');
  ball.style.animation = 'none';
  ball.offsetHeight; // reflow
  ball.style.animation = '';
  ball.classList.add('tapped');
  setTimeout(() => ball.classList.remove('tapped'), 150);
}

function spawnFloatNum(combo) {
  const container = document.getElementById('floating-hits');
  const el   = document.createElement('div');
  el.className = 'float-num';

  const colors = ['#FF9500', '#FFB800', '#00C8FF', '#B040FF', '#39FF14'];
  el.style.color = colors[Math.min(combo - 1, colors.length - 1)];

  el.textContent = combo > 1 ? `+${combo} 🔥` : '+1';

  // Random horizontal position around center
  const cx = window.innerWidth / 2;
  const rx = cx + (Math.random() - 0.5) * 80;
  const ry = window.innerHeight * 0.45 + (Math.random() - 0.5) * 40;
  el.style.left = `${rx}px`;
  el.style.top  = `${ry}px`;
  el.style.transform = 'translateX(-50%)';

  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function flashFullCharge() {
  const carEl = document.getElementById('game-car');
  carEl.style.filter = 'drop-shadow(0 0 30px var(--green)) brightness(1.5)';
  document.getElementById('battery-pct').textContent = '100% ⚡';

  // Flash screen
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed; inset:0; background:rgba(57,255,20,0.15);
    z-index:50; pointer-events:none;
    animation: flash-in 0.4s ease-out forwards;
  `;
  const style = document.createElement('style');
  style.textContent = '@keyframes flash-in { from{opacity:1} to{opacity:0} }';
  document.head.appendChild(style);
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());
}

// ── End Game ───────────────────────────────────────────────
function endGame() {
  clearInterval(state.gameInterval);
  clearTimeout(state.comboTimer);
  state.gameActive = false;

  // Calculate final score
  const energyPct = Math.round(state.energy);
  state.score = Math.round(
    state.hits * 20 +
    (state.maxCombo - 1) * state.hits * 5 +
    energyPct * 15
  );

  setTimeout(() => {
    showScreen('screen-end');
    populateEndScreen(energyPct);
  }, 600);
}

function populateEndScreen(energyPct) {
  // Result card
  setEl('res-hits',   String(state.hits));
  setEl('res-combo',  `×${state.maxCombo}`);
  setEl('res-energy', `${energyPct}%`);
  setEl('res-score',  state.score.toLocaleString('de-DE'));

  // Title / sub text based on performance
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
    sub   = `${energyPct}% – Tippe schneller für mehr Energie!`;
  }
  setEl('end-title', title);
  setEl('end-sub',   sub);

  const trophy = document.getElementById('end-trophy');
  trophy.textContent = energyPct >= 100 ? '🏆' : energyPct >= 75 ? '🥈' : '🏓';

  // Leaderboard
  buildLeaderboard(state.score, energyPct);

  // Animate result numbers
  animateCountUp('res-score', 0, state.score, 1200);
}

function buildLeaderboard(playerScore, playerEnergy) {
  const playerEntry = {
    name:   'DU',
    score:  playerScore,
    energy: Math.round(playerEnergy),
    isYou:  true,
  };

  // Merge and sort
  const entries = [
    ...FAKE_LEADERBOARD.map(e => ({ ...e, isYou: false })),
    playerEntry,
  ].sort((a, b) => b.score - a.score).slice(0, 12);

  const container = document.getElementById('lb-entries');
  container.innerHTML = '';

  entries.forEach((entry, idx) => {
    const rank = idx + 1;
    const el   = document.createElement('div');
    el.className = 'lb-entry' + (entry.isYou ? ' you' : '');

    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    const rankIcon  = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const nameBadge = entry.isYou ? '<span class="you-badge">YOU</span>' : '';

    el.innerHTML = `
      <span class="lb-rank ${rankClass}">${rankIcon}</span>
      <span class="lb-name">${entry.name}${nameBadge}</span>
      <span class="lb-energy">${entry.energy}%⚡</span>
      <span class="lb-score">${entry.score.toLocaleString('de-DE')}</span>
    `;

    container.appendChild(el);

    // Staggered entrance
    el.style.opacity  = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      el.style.opacity    = '1';
      el.style.transform  = 'translateX(0)';
    }, idx * 60 + 200);
  });
}

// ── Restart ────────────────────────────────────────────────
function restartGame() {
  showScreen('screen-start');
  resetGameState();
  // Re-animate countdown overlay reset
  const numEl = document.getElementById('countdown-num');
  numEl.textContent = '3';
  numEl.style.color  = 'var(--orange)';
  numEl.style.filter = 'drop-shadow(0 0 30px var(--orange))';
}

// ── Share ──────────────────────────────────────────────────
function showShareModal() {
  const text = buildShareText();
  document.getElementById('share-text-box').textContent = text;
  document.getElementById('share-modal').classList.remove('hidden');
}
function closeShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}
function copyShareText() {
  const text = document.getElementById('share-text-box').textContent;
  navigator.clipboard?.writeText(text).then(() => {
    const btn = document.querySelector('#share-modal .btn-primary');
    const orig = btn.textContent;
    btn.textContent = '✅ Kopiert!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {
    // fallback: select text
    const el = document.getElementById('share-text-box');
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
}
function buildShareText() {
  const energy = Math.round(state.energy);
  return `🏓⚡🚗 LEAP RALLY
  
Score: ${state.score.toLocaleString('de-DE')} Punkte
Treffer: ${state.hits} × Max Combo ×${state.maxCombo}
Batterie: ${energy}%

Kannst du meinen Score schlagen?
#LeapMotor #LeapRally #EMobility`;
}

// ── Helpers ────────────────────────────────────────────────
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function animateCountUp(id, from, to, duration) {
  const el    = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  const diff  = to - from;

  function step(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
    const current  = Math.round(from + diff * ease);
    el.textContent = current.toLocaleString('de-DE');
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Prevent mobile scroll while playing ───────────────────
document.addEventListener('touchmove', (e) => {
  if (state.gameActive) e.preventDefault();
}, { passive: false });

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Ensure start screen is visible
  document.getElementById('screen-start').classList.add('active');
});
