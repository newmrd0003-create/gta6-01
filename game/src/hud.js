// SOLARA HEAT — hud
// Everything drawn over the 3D view: the health bar, cash, wanted stars,
// the job objective, speed, toasts, and the live 2D minimap (streets,
// towers, waypoint, traffic, flashing police, the player arrow).

import { GRID, cashStr } from './config.js';

export function makeHud() {
  const $ = (id) => document.getElementById(id);
  const hpFill = $('hp-fill');
  const hpNum = $('hp-num');
  const moneyEl = $('money');
  const heatEl = $('heat');
  const goalEl = $('goal');
  const speedEl = $('speedo');
  const noteEl = $('notice');
  const clockEl = $('clock');
  const roundsEl = $('rounds');
  const map = $('map');
  const mapCtx = map.getContext('2d');
  const hurtEl = $('hurt');
  const jobsEl = $('jobs-done');
  let noteTimer = null;
  let hurtTimer = null;

  function hp(h) {
    const pct = Math.max(0, Math.min(100, h));
    hpFill.style.width = pct + '%';
    hpFill.style.background = pct > 50 ? '#37d67a' : pct > 25 ? '#f0b429' : '#e5484d';
    hpNum.textContent = Math.round(pct);
    // Under a quarter health the bar pulses — one glance says enough.
    hpFill.classList.toggle('low', pct <= 25);
  }
  // "Job 2/4" — how far through Marta's story Leo is.
  function jobs(finished, total) {
    jobsEl.textContent = total > 0 ? `★ Jobs ${finished}/${total}` : '';
  }
  // Full-screen red vignette that fades fast: a crash, a ram, a bullet.
  function flash(strength) {
    hurtEl.style.opacity = String(Math.max(0.15, Math.min(0.6, strength || 0.35)));
    if (hurtTimer) clearTimeout(hurtTimer);
    hurtTimer = setTimeout(() => { hurtEl.style.opacity = '0'; }, 260);
  }
  function money(c) { moneyEl.textContent = cashStr(c); }
  function stars(n) {
    heatEl.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
    heatEl.classList.toggle('hot', n > 0);
  }
  function goal(t) { goalEl.textContent = t; }
  function speedo(kmh, inCar) {
    speedEl.textContent = inCar ? Math.round(kmh) + ' km/h' : '';
  }
  function clock(sec) {
    clockEl.textContent = sec > 0 ? '⏱ ' + Math.ceil(sec) + 's' : '';
  }
  function rounds(a) { roundsEl.textContent = '🔫 ' + a + ' / ∞'; }
  function note(text) {
    noteEl.textContent = text;
    noteEl.classList.add('show');
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(() => noteEl.classList.remove('show'), 5200);
  }

  // Minimap: the 660x660 world squeezed onto a 180px canvas, north up.
  function drawMap(world) {
    const S = 180;
    const scale = S / (GRID.half * 2 + 40);
    const toMap = (x, z) => [(x + GRID.half + 20) * scale, (z + GRID.half + 20) * scale];
    mapCtx.clearRect(0, 0, S, S);
    mapCtx.fillStyle = '#0e2a33';
    mapCtx.fillRect(0, 0, S, S);
    // Sea strip along the south edge.
    mapCtx.fillStyle = '#1e7fa8';
    mapCtx.fillRect(0, S - 14, S, 14);
    // Towers.
    mapCtx.fillStyle = '#5a6a72';
    for (const b of world.towers) {
      const [x, y] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      mapCtx.fillRect(x, y, Math.max(1.5, b.w * scale), Math.max(1.5, b.d * scale));
    }
    // Streets.
    mapCtx.strokeStyle = '#c8c8c8';
    mapCtx.lineWidth = 2.5;
    for (let v = -300; v <= 300; v += 60) {
      const [x1, y1] = toMap(v, -GRID.half);
      const [x2, y2] = toMap(v, GRID.half);
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y2); mapCtx.stroke();
      const [x3, y3] = toMap(-GRID.half, v);
      const [x4, y4] = toMap(GRID.half, v);
      mapCtx.beginPath(); mapCtx.moveTo(x3, y3); mapCtx.lineTo(x4, y4); mapCtx.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      mapCtx.fillStyle = color;
      mapCtx.beginPath(); mapCtx.arc(mx, my, r, 0, Math.PI * 2); mapCtx.fill();
    };
    // Waypoint ring.
    if (world.waypoint) {
      const [wx, wy] = toMap(world.waypoint.x, world.waypoint.z);
      mapCtx.strokeStyle = '#ffc030';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(wx, wy, 7, 0, Math.PI * 2); mapCtx.stroke();
      dot(world.waypoint.x, world.waypoint.z, '#ffc030', 3);
    }
    // Traffic in white, police flashing blue/red.
    for (const c of world.traffic) dot(c.x, c.z, '#ffffff', 1.8);
    const blink = Math.floor(performance.now() / 300) % 2 === 0;
    for (const c of world.police) dot(c.x, c.z, blink ? '#ff4040' : '#4060ff', 3);
    // Player arrow.
    const [px, py] = toMap(world.heroX, world.heroZ);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(Math.PI - world.heroDir); // map: +x right, +z down
    mapCtx.fillStyle = '#37d67a';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4.5, 5);
    mapCtx.lineTo(-4.5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  return {
    hp, money, stars, goal, speedo, clock, rounds, note, drawMap, jobs, flash,
  };
}
