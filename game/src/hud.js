// SOLARA HEAT — hud.js
// One job: everything drawn over the 3D view — health bar, cash, wanted
// stars, mission objective, speed, toasts, and the live 2D minimap canvas
// (roads, buildings, waypoint, police, traffic, player arrow).

import { WORLD, formatCash } from './config.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const healthFill = $('health-fill');
  const healthText = $('health-text');
  const cashText = $('cash');
  const starsEl = $('stars');
  const objectiveEl = $('objective');
  const speedEl = $('speed');
  const toastEl = $('toast');
  const timerEl = $('timer');
  const ammoEl = $('ammo');
  const map = $('minimap');
  const mapCtx = map.getContext('2d');
  const flashEl = $('damage-flash');
  const jobsEl = $('jobs');
  let toastTimer = null;
  let flashTimer = null;

  function setHealth(h) {
    const pct = Math.max(0, Math.min(100, h));
    healthFill.style.width = pct + '%';
    healthFill.style.background = pct > 50 ? '#37d67a' : pct > 25 ? '#f0b429' : '#e5484d';
    healthText.textContent = Math.round(pct);
    // under a quarter health the bar pulses — a glance is enough to know
    healthFill.classList.toggle('low', pct <= 25);
  }
  // "Job 2/4" — how far through Marta's story the player is.
  function setJobs(done, total) {
    jobsEl.textContent = total > 0 ? `★ Jobs ${done}/${total}` : '';
  }
  // Full-screen red vignette that fades fast: a crash, a ram, a bullet.
  function flashDamage(strength) {
    flashEl.style.opacity = String(Math.max(0.15, Math.min(0.6, strength || 0.35)));
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashEl.style.opacity = '0'; }, 260);
  }
  function setCash(c) { cashText.textContent = formatCash(c); }
  function setStars(n) {
    starsEl.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
    starsEl.classList.toggle('hot', n > 0);
  }
  function setObjective(t) { objectiveEl.textContent = t; }
  function setSpeed(kmh, inCar) {
    speedEl.textContent = inCar ? Math.round(kmh) + ' km/h' : '';
  }
  function setTimer(sec) {
    timerEl.textContent = sec > 0 ? '⏱ ' + Math.ceil(sec) + 's' : '';
  }
  function setAmmo(a) { ammoEl.textContent = '🔫 ' + a + ' / ∞'; }
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 5200);
  }

  // Minimap: world 660x660 -> 180px canvas, north = up (-z up).
  function drawMinimap(world) {
    const S = 180;
    const scale = S / (WORLD.half * 2 + 40);
    const toMap = (x, z) => [(x + WORLD.half + 20) * scale, (z + WORLD.half + 20) * scale];
    mapCtx.clearRect(0, 0, S, S);
    mapCtx.fillStyle = '#0e2a33';
    mapCtx.fillRect(0, 0, S, S);
    // sea strip at the south edge
    mapCtx.fillStyle = '#1e7fa8';
    mapCtx.fillRect(0, S - 14, S, 14);
    // buildings
    mapCtx.fillStyle = '#5a6a72';
    for (const b of world.buildings) {
      const [x, y] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      mapCtx.fillRect(x, y, Math.max(1.5, b.w * scale), Math.max(1.5, b.d * scale));
    }
    // roads
    mapCtx.strokeStyle = '#c8c8c8';
    mapCtx.lineWidth = 2.5;
    for (let v = -300; v <= 300; v += 60) {
      const [x1, y1] = toMap(v, -WORLD.half);
      const [x2, y2] = toMap(v, WORLD.half);
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y2); mapCtx.stroke();
      const [x3, y3] = toMap(-WORLD.half, v);
      const [x4, y4] = toMap(WORLD.half, v);
      mapCtx.beginPath(); mapCtx.moveTo(x3, y3); mapCtx.lineTo(x4, y4); mapCtx.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      mapCtx.fillStyle = color;
      mapCtx.beginPath(); mapCtx.arc(mx, my, r, 0, Math.PI * 2); mapCtx.fill();
    };
    // waypoint
    if (world.waypoint) {
      const [wx, wy] = toMap(world.waypoint.x, world.waypoint.z);
      mapCtx.strokeStyle = '#ffc030';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(wx, wy, 7, 0, Math.PI * 2); mapCtx.stroke();
      dot(world.waypoint.x, world.waypoint.z, '#ffc030', 3);
    }
    // traffic (white) and police (flashing blue/red)
    for (const c of world.trafficCars) dot(c.x, c.z, '#ffffff', 1.8);
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    for (const c of world.policeCars) dot(c.x, c.z, flash ? '#ff4040' : '#4060ff', 3);
    // player arrow
    const [px, py] = toMap(world.playerX, world.playerZ);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(Math.PI - world.playerHeading); // map: +x right, +z down
    mapCtx.fillStyle = '#37d67a';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6); mapCtx.lineTo(4.5, 5); mapCtx.lineTo(-4.5, 5);
    mapCtx.closePath(); mapCtx.fill();
    mapCtx.restore();
  }

  return { setHealth, setCash, setStars, setObjective, setSpeed, setTimer, setAmmo, toast, drawMinimap, setJobs, flashDamage };
}
