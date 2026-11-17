// SOLARA HEAT — main
// Boot the game and run it. This file owns Leo (on foot and in a car), the
// third-person camera, combat, particles and skid marks, street cash, the
// menu / pause / busted screens, saving, and the ?scene= staging used for
// screenshots. Every other system lives in its own file.

import * as THREE from 'three';
import { TITLE, CITY_NAME, GRID, BALANCE, clampNum, steerTo } from './config.js';
import { makeControls, K_ENTER, K_PUNCH, K_RELOAD, K_PAUSE, K_FIRE, K_START, K_HORN } from './input.js';
import { makeAudio } from './audio.js';
import { buildCity } from './city.js';
import { spawnCar } from './vehicles.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './pedestrians.js';
import { makePolice } from './police.js';
import { makeStory } from './missions.js';
import { makeHud } from './hud.js';
import { readSave, storeSave } from './save.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const sceneParam = params.get('scene'); // drive | foot | mission | chase
// Staged (?scene=) runs auto-drive Leo's car up to the scene's cruise
// speed, so a screenshot taken seconds after load still shows the car
// moving instead of one that has rolled to a stop with no keys held.
let stageCruise = 0;

const canvas = document.getElementById('game');
const hud = makeHud();
const audio = makeAudio();
const input = makeControls(canvas);

// --- renderer and scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();

const city = buildCity(scene);
const traffic = makeTraffic(scene, 14);
const crowd = makeCrowd(scene, 26);
const police = makePolice(scene);
const story = makeStory(scene);

// --- Leo on foot ---------------------------------------------------------------
function makeHeroMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc88a5a });
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc03028 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.85, 0.32), jeans);
  legs.position.y = 0.42;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.72, 0.36), jacket);
  torso.position.y = 1.2;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0x222222 }));
  cap.position.y = 1.98;
  g.add(cap);
  for (const sx of [-0.42, 0.42]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.15), jacket);
    arm.position.set(sx, 1.2, 0);
    g.add(arm);
  }
  g.userData.legs = legs;
  return g;
}

const heroMesh = makeHeroMesh();
scene.add(heroMesh);

// --- game state ------------------------------------------------------------------
const G = {
  screen: 'menu', // menu | playing | paused | busted
  cash: 150,
  hp: 100,
  ammo: 12,
  heroX: 0, heroZ: 30, heroDir: 0,
  stride: 0,
  inCar: false,
  car: null,
  jobsDone: [],
  playTime: 0,
  camYaw: 0, camPitch: 0.32,
  saveClock: 0,
  // Lifetime totals, persisted with the save (see save.js).
  stats: { earned: 0, carsStolen: 0, busts: 0 },
};

let saved = readSave();
if (saved) {
  G.cash = saved.cash;
  G.hp = saved.health;
  G.jobsDone = saved.missionsDone.slice();
  G.heroX = saved.player.x;
  G.heroZ = saved.player.z;
  G.heroDir = saved.player.heading;
  G.playTime = saved.playTime || 0;
  G.stats = { ...G.stats, ...(saved.stats || {}) };
  story.restore(G.jobsDone);
}
story.attach({
  cash(n) {
    G.cash += n;
    G.stats.earned += n;
    hud.money(G.cash);
    hud.note(`+$${n}`);
    audio.coin();
    saveNow();
  },
  wanted(n) { police.setHeat(n); },
  toast(t) { hud.note(t); },
  sfx(name) {
    if (name === 'mission') audio.sting();
    else if (name === 'pickup') audio.coin();
  },
  objective(t) { hud.goal(t); },
});

// --- street cash -------------------------------------------------------------------
const pickups = [];
{
  const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc030 });
  const spots = [
    [-30, 90], [90, 60], [-90, -60], [150, -180],
    [-180, 180], [240, 60], [30, -240], [-240, -240],
  ];
  for (const [x, z] of spots) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 1, z);
    scene.add(m);
    pickups.push({ mesh: m, x, z, taken: false });
  }
}

// --- particles, skid marks, muzzle flash ----------------------------------------------
const bits = [];
const bitGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
function burstBits(x, y, z, color, n, spread) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    scene.add(m);
    bits.push({
      mesh: m, life: 0.6 + Math.random() * 0.5,
      vx: (Math.random() - 0.5) * spread,
      vy: Math.random() * spread * 0.7,
      vz: (Math.random() - 0.5) * spread,
    });
  }
}
const skidGeo = new THREE.PlaneGeometry(0.5, 1.6);
const skidMat = new THREE.MeshBasicMaterial({ color: 0x181818, transparent: true, opacity: 0.55 });
const skids = [];
function dropSkid(x, z, heading) {
  if (skids.length > 120) {
    const old = skids.shift();
    scene.remove(old);
  }
  const m = new THREE.Mesh(skidGeo, skidMat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = heading;
  m.position.set(x, 0.14, z);
  scene.add(m);
  skids.push(m);
}
const flashLight = new THREE.PointLight(0xffc060, 0, 18);
scene.add(flashLight);
let flashLeft = 0;
let lastBumpAt = -10; // playTime of the last building hit (damage cooldown)

// --- camera ---------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function moveCamera(dt) {
  const tx = G.inCar && G.car ? G.car.x : G.heroX;
  const tz = G.inCar && G.car ? G.car.z : G.heroZ;
  const focusY = G.inCar ? 1.6 : 1.7;
  // Drag orbits; in a car the camera swings back behind it.
  const md = input.mouse();
  G.camYaw -= md.x * 0.005;
  G.camPitch = clampNum(G.camPitch + md.y * 0.003, 0.08, 0.9);
  if (G.inCar && G.car) {
    // Ease toward directly behind the car instead of snapping to it.
    G.camYaw = steerTo(G.camYaw, G.car.heading + Math.PI, dt * 2.2);
  }
  // Driving wants a higher, wider view than walking: more city in frame,
  // the car smaller in it.
  const dist = G.inCar ? 15 : 9;
  const pitch = G.inCar ? Math.max(G.camPitch, 0.42) : G.camPitch;
  const cx = tx + Math.sin(G.camYaw) * Math.cos(pitch) * dist;
  const cz = tz + Math.cos(G.camYaw) * Math.cos(pitch) * dist;
  const cy = focusY + Math.sin(pitch) * dist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, focusY, tz);
}

// --- menus --------------------------------------------------------------------------------
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const overEl = document.getElementById('over');
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');
const continueBtn = document.getElementById('btn-continue');

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function showOnly(el) {
  for (const e of [menuEl, pauseEl, overEl]) hide(e);
  if (el) show(el);
}

function startRun(fresh) {
  if (!fresh && saved) {
    G.cash = saved.cash;
    G.hp = saved.health;
    G.jobsDone = saved.missionsDone.slice();
    G.heroX = saved.player.x;
    G.heroZ = saved.player.z;
    G.heroDir = saved.player.heading;
    G.playTime = saved.playTime || 0;
    G.stats = { ...G.stats, ...(saved.stats || {}) };
    story.restore(G.jobsDone);
  } else if (fresh) {
    G.cash = 150;
    G.hp = 100;
    G.ammo = 12;
    G.jobsDone = [];
    G.heroX = 0;
    G.heroZ = 30;
    G.heroDir = 0;
    G.playTime = 0;
    G.stats = { earned: 0, carsStolen: 0, busts: 0 };
    story.restore([]);
  }
  G.screen = 'playing';
  G.inCar = false;
  G.car = null;
  police.clearHeat();
  showOnly(null);
  input.clear();
  audio.unlock();
  hud.money(G.cash);
  hud.hp(G.hp);
  hud.stars(0);
  hud.rounds(G.ammo);
  hud.jobs(story.done, story.total);
  hud.goal(G.jobsDone.length >= story.total
    ? 'All missions done — free roam. Marta owes you one.'
    : 'Free roam — press M for the next job from Marta.');
  hud.note(`${TITLE} — welcome to ${CITY_NAME}. Press M for work.`);
}

function pauseRun() {
  if (G.screen !== 'playing') return;
  G.screen = 'paused';
  showOnly(pauseEl);
  saveNow();
}
function resumeRun() {
  if (G.screen !== 'paused') return;
  G.screen = 'playing';
  showOnly(null);
  audio.unlock();
}
function endRun(title, text) {
  G.screen = 'busted';
  overTitle.textContent = title;
  overText.textContent = text;
  showOnly(overEl);
  audio.defeat();
  const fine = Math.min(G.cash, BALANCE.fine);
  G.cash -= fine;
  G.stats.busts += 1;
  hud.money(G.cash);
  G.hp = BALANCE.respawnHp;
  police.clearHeat();
  if (G.inCar && G.car) { G.inCar = false; G.car = null; }
  G.heroX = 0;
  G.heroZ = 30;
  G.heroDir = 0;
  saveNow();
}

document.getElementById('btn-new').addEventListener('click', () => { audio.tick(); startRun(true); });
continueBtn.addEventListener('click', () => { audio.tick(); startRun(false); });
document.getElementById('btn-resume').addEventListener('click', () => { audio.tick(); resumeRun(); });
document.getElementById('btn-quit').addEventListener('click', () => {
  audio.tick();
  G.screen = 'menu';
  saveNow();
  showOnly(menuEl);
  if (saved) continueBtn.classList.remove('hidden');
});
document.getElementById('btn-again').addEventListener('click', () => {
  audio.tick();
  G.screen = 'playing';
  showOnly(null);
});
document.getElementById('btn-mute').addEventListener('click', (e) => {
  const muted = audio.toggleMute();
  e.target.textContent = muted ? '🔇 Muted' : '🔊 Sound on';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && G.screen === 'playing') {
    if (story.next()) saveNow();
    else hud.note('No jobs right now — all missions done.');
  }
});

function saveNow() {
  saved = {
    cash: G.cash, health: G.hp, missionsDone: G.jobsDone,
    playerX: G.heroX, playerZ: G.heroZ, playerHeading: G.heroDir,
    playTime: G.playTime, stats: { ...G.stats },
  };
  storeSave(saved);
}

// --- combat ----------------------------------------------------------------------------------
function firePistol() {
  if (G.ammo <= 0) {
    audio.tick();
    hud.note('Out of ammo — press R to reload.');
    return;
  }
  G.ammo -= 1;
  hud.rounds(G.ammo);
  audio.bang();
  const px = G.inCar && G.car ? G.car.x : G.heroX;
  const pz = G.inCar && G.car ? G.car.z : G.heroZ;
  const dirX = -Math.sin(G.camYaw), dirZ = -Math.cos(G.camYaw);
  flashLight.position.set(px + dirX * 2, 1.6, pz + dirZ * 2);
  flashLight.intensity = 60;
  flashLeft = 0.06;
  // Nearest hittable target inside a cone in front of the camera.
  let best = null, bd = 45;
  const consider = (x, z, kind, ref) => {
    const dx = x - px, dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d > 45 || d < 1) return;
    const dot = (dx * dirX + dz * dirZ) / d;
    if (dot < 0.94) return;
    if (d < bd) { bd = d; best = { kind, ref, x, z }; }
  };
  for (const p of crowd.folk) consider(p.x, p.z, 'ped', p);
  for (const c of traffic.cars) consider(c.x, c.z, 'car', c);
  for (const c of police.units) consider(c.x, c.z, 'police', c);
  if (!best) {
    // A miss still scares the street — witnesses run from gunfire.
    crowd.scatter(px, pz, 18);
    return;
  }
  burstBits(best.x, 1.2, best.z, 0xffd060, 10, 6);
  crowd.scatter(best.x, best.z, 22);
  if (best.kind === 'ped') {
    crowd.floorIt(best.ref);
    police.addHeat(8);
    hud.note('A bystander went down — the PD noticed.');
  } else if (best.kind === 'car') {
    best.ref.hp -= 34;
    police.addHeat(6);
    if (best.ref.hp <= 0) {
      burstBits(best.x, 1, best.z, 0x404040, 24, 9);
      best.ref.speed = 0;
    }
  } else {
    best.ref.hp -= 25;
    police.addHeat(12);
    if (best.ref.hp <= 0) {
      burstBits(best.x, 1, best.z, 0x404040, 24, 9);
      best.ref.speed = 0;
    }
  }
}

function swingFist() {
  audio.thud();
  const p = crowd.closest(G.heroX, G.heroZ, 2.4);
  if (p) {
    crowd.floorIt(p);
    police.addHeat(6);
    burstBits(p.x, 1.2, p.z, 0xffe0a0, 8, 4);
    hud.note('You laid one out. Witnesses called it in.');
  }
}

// --- get in / out of a car ---------------------------------------------------------------------
function enterExitCar() {
  if (G.inCar) {
    // Step out beside the car.
    const c = G.car;
    G.heroX = c.x + Math.cos(c.heading) * 2.5;
    G.heroZ = c.z - Math.sin(c.heading) * 2.5;
    G.heroDir = c.heading;
    G.inCar = false;
    G.car = null;
    return;
  }
  const car = traffic.closest(G.heroX, G.heroZ, 5);
  if (!car) {
    hud.note('No car close enough — walk up to one.');
    return;
  }
  traffic.takeOut(car);
  G.car = car;
  G.inCar = true;
  G.car.speed = 0;
  G.car.hp = Math.max(G.car.hp, 60);
  G.stats.carsStolen += 1;
  police.addHeat(10);
  audio.coin();
  hud.note('Car taken — the PD logged the theft.');
}

// --- one fixed step ------------------------------------------------------------------------------
function tick(dt) {
  G.playTime += dt;
  const actions = input.take();
  if (actions & K_PAUSE) { pauseRun(); return; }
  if (actions & K_ENTER) enterExitCar();
  if (actions & K_PUNCH && !G.inCar) swingFist();
  if (actions & K_FIRE && !G.inCar) firePistol();
  if (actions & K_HORN && G.inCar) {
    audio.horn();
    crowd.scatter(G.car.x, G.car.z, 12);
  }
  if (actions & K_RELOAD) {
    G.ammo = 12;
    hud.rounds(G.ammo);
    audio.tick();
  }

  // --- moving Leo ---
  if (G.inCar && G.car) {
    const d = input.drive();
    if (sceneParam && G.car.speed < stageCruise) d.throttle = 1;
    const car = G.car;
    car.driveStep(dt, d.throttle, d.steer, d.brake,
      d.boost ? BALANCE.boostTop : BALANCE.carTop);
    const fixed = city.pushOut(car.x, car.z, 2.2);
    if (fixed.x !== car.x || fixed.z !== car.z) {
      const impact = Math.abs(car.speed);
      car.x = fixed.x;
      car.z = fixed.z;
      car.speed *= 0.4;
      // A hard hit into a tower damages the car, not just the paint.
      // One hit per 0.6 s at most: being shoved against a wall by a ram
      // must not stack a hit every frame and insta-wreck the car.
      if (impact > 8 && G.playTime - lastBumpAt > 0.6) {
        lastBumpAt = G.playTime;
        car.hp -= Math.min(12, impact * 0.5);
        hud.flash(0.3);
        audio.smash();
        burstBits(car.x, 0.8, car.z, 0xd8d8d8, 6, 4);
      }
    }
    car.x = clampNum(car.x, -GRID.half, GRID.half);
    car.z = clampNum(car.z, -GRID.half, GRID.half);
    car.refresh();
    if (d.brake && Math.abs(car.speed) > 12) {
      dropSkid(car.x - Math.sin(car.heading) * 1.6, car.z - Math.cos(car.heading) * 1.6, car.heading);
      if (Math.random() < dt * 8) burstBits(car.x, 0.4, car.z, 0xaaaaaa, 1, 2);
      if (Math.random() < dt * 2) audio.skid();
    }
    audio.engine(Math.abs(car.speed) / 34, true);
    // Running over walkers while driving.
    const hit = crowd.closest(car.x, car.z, 2.6);
    if (hit && Math.abs(car.speed) > 4) {
      crowd.floorIt(hit);
      police.addHeat(10);
      car.speed *= 0.85;
      audio.smash();
    }
    // A wrecked car blows out: smoke, a bang, and Leo bails out on foot.
    if (car.hp <= 0) {
      burstBits(car.x, 1.2, car.z, 0x303030, 30, 10);
      burstBits(car.x, 1.2, car.z, 0xff8020, 20, 8);
      audio.whoosh();
      hud.flash(0.5);
      hud.note('Your ride is wrecked — on foot now, Leo.');
      police.addHeat(15);
      G.heroX = car.x + Math.cos(car.heading) * 3;
      G.heroZ = car.z - Math.sin(car.heading) * 3;
      G.heroDir = car.heading;
      G.inCar = false;
      G.car = null;
      traffic.takeOut(car);
      car.drop();
    }
  } else {
    const m = input.walk();
    const sprint = input.boosting() ? BALANCE.sprint : 1;
    const speed = BALANCE.walk * sprint;
    // W moves away from the camera (third-person standard).
    const fx = -Math.sin(G.camYaw), fz = -Math.cos(G.camYaw);
    const rx = -fz, rz = fx;
    const mx = fx * m.forward + rx * m.strafe;
    const mz = fz * m.forward + rz * m.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      G.heroX += (mx / len) * speed * dt;
      G.heroZ += (mz / len) * speed * dt;
      G.heroDir = Math.atan2(mx / len, mz / len);
      G.stride += dt * speed * 2.2;
    }
    const fixed = city.pushOut(G.heroX, G.heroZ, 0.7);
    G.heroX = fixed.x;
    G.heroZ = fixed.z;
    G.heroX = clampNum(G.heroX, -GRID.half, GRID.half);
    G.heroZ = clampNum(G.heroZ, -GRID.half, GRID.half);
    heroMesh.position.set(G.heroX, 0, G.heroZ);
    heroMesh.rotation.y = G.heroDir;
    heroMesh.userData.legs.position.y = 0.42 + Math.abs(Math.sin(G.stride)) * 0.12;
    heroMesh.visible = true;
    audio.engine(0, false);
  }
  heroMesh.visible = !G.inCar;

  // --- street cash ---
  for (const pk of pickups) {
    if (pk.taken) continue;
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 1 + Math.sin(performance.now() / 400 + pk.x) * 0.2;
    const px = G.inCar && G.car ? G.car.x : G.heroX;
    const pz = G.inCar && G.car ? G.car.z : G.heroZ;
    if (Math.hypot(pk.x - px, pk.z - pz) < 2.4) {
      pk.taken = true;
      pk.mesh.visible = false;
      G.cash += BALANCE.pickup;
      G.stats.earned += BALANCE.pickup;
      hud.money(G.cash);
      audio.coin();
      hud.note(`Found street cash +$${BALANCE.pickup}`);
    }
  }

  // --- the world systems ---
  const threats = [{
    x: G.inCar && G.car ? G.car.x : G.heroX,
    z: G.inCar && G.car ? G.car.z : G.heroZ,
    radius: G.inCar ? 14 : 8,
  }];
  traffic.tick(dt, null, G.inCar ? G.car : null);
  crowd.tick(dt, threats);
  const pol = police.tick(dt,
    { x: G.heroX, z: G.heroZ },
    G.inCar ? G.car : null,
    () => endRun('BUSTED', 'The Solara PD hauled you in. You paid $100 bail and woke up at the plaza.'),
    () => {
      hud.flash(0.22);
      if (Math.random() < dt * 2) audio.smash();
    });
  // A ram can shove Leo's car sideways into a tower — push it back out
  // before the next step reads the collision as a hard impact.
  if (G.inCar && G.car) {
    const fixed = city.pushOut(G.car.x, G.car.z, 2.2);
    G.car.x = fixed.x;
    G.car.z = fixed.z;
    // And the car slowly recovers once the cruisers are off its bumper.
    if (pol.nearest > 6 && G.car.hp < 100) {
      G.car.hp = Math.min(100, G.car.hp + 2 * dt);
    }
    G.car.refresh();
  }
  // The siren wails only while the PD hunts, louder the closer they are.
  audio.siren(police.wanted > 0, pol.nearest);

  // --- jobs ---
  story.tick(dt, {
    x: G.inCar && G.car ? G.car.x : G.heroX,
    z: G.inCar && G.car ? G.car.z : G.heroZ,
    inCar: G.inCar,
    wanted: police.wanted,
  });

  // --- health, heat, HUD ---
  if (police.wanted === 0 && G.hp < 100) {
    G.hp = Math.min(100, G.hp + BALANCE.regen * dt);
  }
  if (G.hp <= 0) {
    endRun('WASTED', 'Leo went down in Costa Solara. The story continues at the plaza.');
    return;
  }
  hud.hp(G.hp);
  hud.stars(police.wanted);
  hud.jobs(story.done, story.total);
  hud.speedo(G.inCar && G.car ? Math.abs(G.car.speed) * 3.6 : 0, G.inCar);
  hud.clock(story.clock);
  hud.drawMap({
    towers: city.towers,
    traffic: traffic.cars,
    police: police.units,
    waypoint: story.target(),
    heroX: G.inCar && G.car ? G.car.x : G.heroX,
    heroZ: G.inCar && G.car ? G.car.z : G.heroZ,
    heroDir: G.inCar && G.car ? G.car.heading : G.heroDir,
  });

  // --- particles and flash ---
  for (let i = bits.length - 1; i >= 0; i--) {
    const p = bits[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      bits.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 6 * dt;
  }
  if (flashLeft > 0) {
    flashLeft -= dt;
    if (flashLeft <= 0) flashLight.intensity = 0;
  }
  // The sun follows Leo so the shadows stay crisp.
  const fx = G.inCar && G.car ? G.car.x : G.heroX;
  const fz = G.inCar && G.car ? G.car.z : G.heroZ;
  city.sun.position.set(fx + 180, 220, fz - 140);
  city.sun.target.position.set(fx, 0, fz);
  city.sun.target.updateMatrixWorld();

  // --- autosave ---
  G.saveClock += dt;
  if (G.saveClock > 15) {
    G.saveClock = 0;
    saveNow();
  }
}

// --- staged scenes for screenshots -------------------------------------------------------
// ?scene=drive|foot|mission|chase starts the game already in motion, with
// the world dressed around Leo: traffic on the streets, people on the
// pavements, police behind the car on a chase. The camera sits behind the
// car (heading + PI) or over Leo's shoulder on foot. After staging, the
// world settles for 90 fixed steps with the car's cruise speed held, so
// traffic, walkers and police are in frame and the HUD is live.
const STAGED = ['drive', 'foot', 'mission', 'chase'];

function stageCar(x, z, heading, paint, cruise) {
  const car = spawnCar(scene, x, z, heading, paint, false);
  G.car = car;
  G.inCar = true;
  car.speed = cruise;
  G.heroX = x;
  G.heroZ = z;
  G.camYaw = heading + Math.PI; // directly behind the car
  return car;
}

function stage(name) {
  startRun(true);
  G.screen = 'playing';
  showOnly(null);
  let cruise = 0;
  if (name === 'drive') {
    // Cover shot: a chase — two stars, cruisers in the mirror, a job on
    // the HUD, traffic ahead on the avenue.
    cruise = 18;
    stageCar(0, 60, Math.PI, 0xd83838, cruise);
    police.setHeat(2);
    police.dropNear(0, 60, Math.PI);
    police.dropNear(0, 60, Math.PI * 0.9);
    traffic.seedNear(0, 60, 6);
    crowd.pullNear(0, 60, 5);
    story.byId('sunset-run');
  } else if (name === 'foot') {
    // On foot on the x=0 avenue, facing the Solara Tower 30 m up the road.
    // (The avenue palms stand at x=+-8 and the lamps at x=+-30, so this
    // sightline stays clear of both.)
    G.heroX = 0;
    G.heroZ = 30;
    G.heroDir = Math.PI / 2;
    G.camYaw = Math.PI * 1.5;
    crowd.pullNear(0, 30, 8);
    traffic.seedNear(0, 30, 4);
  } else if (name === 'mission') {
    // Sunset Run in progress: in a car, timer running, marina beacon ahead.
    // Heading -PI/2 drives -x along the z=300 avenue, straight at the
    // marina waypoint at (-240, 300), so the beacon is in frame — and the
    // car starts 140 m out, so it is still en route (not already done)
    // when the shot is taken.
    cruise = 16;
    stageCar(-100, 300, -Math.PI * 0.5, 0x2f6fd8, cruise);
    traffic.seedNear(-100, 300, 5);
    crowd.pullNear(-100, 300, 4);
    story.byId('sunset-run');
  } else if (name === 'chase') {
    // Full heat: three stars, cruisers on the tail, Heat Escape running.
    // Heading PI drives straight down the x=60 avenue, so the chase
    // stays on the road instead of grinding through buildings. The
    // cruisers flank (one each side, one centre) so the shot shows Leo's
    // car instead of one cruiser filling the frame behind it.
    cruise = 22;
    stageCar(60, -60, Math.PI, 0xf0c030, cruise);
    police.setHeat(3);
    police.dropNear(60, -60, Math.PI + 0.35);
    police.dropNear(60, -60, Math.PI - 0.35);
    police.dropNear(60, -60, Math.PI);
    traffic.seedNear(60, -60, 6);
    story.byId('heat-escape');
  }
  // Let the world settle a moment so traffic, walkers and police are in frame.
  stageCruise = cruise;
  for (let i = 0; i < 90; i++) {
    tick(STEP);
    // No keys are held while staging, so drag would slow the car to a
    // crawl — hold the cruise speed so the shot shows motion.
    if (G.car) G.car.speed = cruise;
  }
  moveCamera(0.016);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// --- the loop -----------------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (G.screen === 'playing') {
    acc += dt;
    while (acc >= STEP) { tick(STEP); acc -= STEP; }
    moveCamera(dt);
    renderer.render(scene, camera);
  } else if (G.screen === 'menu') {
    if (input.take() & K_START) { startRun(true); return; }
    // A slow orbit over the city behind the title screen.
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 160, 90, Math.cos(t * 0.05) * 160);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
}

// --- boot ------------------------------------------------------------------------------------------
// Alt-Tabbing away mid-chase pauses instead of leaving Leo to be busted
// while the tab is hidden.
window.addEventListener('blur', () => { if (G.screen === 'playing') pauseRun(); });

if (saved) continueBtn.classList.remove('hidden');
hud.money(G.cash);
hud.hp(G.hp);
hud.stars(0);
hud.rounds(G.ammo);
hud.jobs(story.done, story.total);
hud.goal('Press Enter or click New Game.');
heroMesh.position.set(G.heroX, 0, G.heroZ);
heroMesh.rotation.y = G.heroDir;

if (sceneParam) {
  if (STAGED.includes(sceneParam)) {
    stage(sceneParam);
  } else {
    console.warn(`SOLARA HEAT: unknown ?scene=${sceneParam}, showing the menu.`);
  }
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}
