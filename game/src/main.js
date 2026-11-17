// SOLARA HEAT — main.js
// One job: boot the game and run it. Owns the player (on foot and in a
// car), the third-person camera, combat, particles and skid marks, cash
// pickups, the menu / pause / busted screens, saving, and the ?scene=
// staging used for screenshots. All other systems live in their own files.

import * as THREE from 'three';
import { GAME_TITLE, GAME_SUBTITLE, CITY_NAME, WORLD, TUNING, clamp, lerp, turnToward } from './config.js';
import { createInput, ACT_ENTER, ACT_PUNCH, ACT_RELOAD, ACT_PAUSE, ACT_SHOOT, ACT_START, ACT_HORN } from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createCar } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { loadSave, writeSave, defaultSave } from './save.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const sceneParam = params.get('scene'); // drive | foot | mission | chase
// Staged (?scene=) runs auto-drive the player's car up to the scene's
// cruise speed, so a screenshot taken seconds after load still shows the
// car moving instead of one that has rolled to a stop with no keys held.
let stageCruise = 0;

const canvas = document.getElementById('game');
const hud = createHud();
const audio = createAudio();
const input = createInput(canvas);

// --- renderer / scene ------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();

const city = createCity(scene);
const traffic = createTraffic(scene, 14);
const peds = createPedestrians(scene, 26);
const police = createPolice(scene);
const missions = createMissions(scene);

// --- player on foot ----------------------------------------------------------
function buildPlayerMesh() {
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
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12),
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

const playerMesh = buildPlayerMesh();
scene.add(playerMesh);

// --- game state --------------------------------------------------------------
const state = {
  screen: 'menu', // menu | playing | paused | busted
  cash: 150,
  health: 100,
  ammo: 12,
  playerX: 0, playerZ: 30, playerHeading: 0,
  playerSpeed: 0,
  walkPhase: 0,
  inCar: false,
  playerCar: null,
  missionsDone: [],
  playTime: 0,
  camYaw: 0, camPitch: 0.32, camDist: 10,
  wantedFlash: 0,
  saveTimer: 0,
  // Lifetime totals, persisted with the save (see save.js).
  stats: { earned: 0, carsStolen: 0, busts: 0 },
};

let save = loadSave();
if (save) {
  state.cash = save.cash;
  state.health = save.health;
  state.missionsDone = save.missionsDone.slice();
  state.playerX = save.player.x;
  state.playerZ = save.player.z;
  state.playerHeading = save.player.heading;
  state.playTime = save.playTime || 0;
  state.stats = { ...state.stats, ...(save.stats || {}) };
  missions.restoreDone(state.missionsDone);
}
missions.bind({
  cash(n) { state.cash += n; state.stats.earned += n; hud.setCash(state.cash); hud.toast(`+$${n}`); audio.pickup(); saveNow(); },
  wanted(n) { police.setWanted(n); },
  toast(t) { hud.toast(t); },
  sfx(name) { if (name === 'mission') audio.mission(); else if (name === 'pickup') audio.pickup(); },
  objective(t) { hud.setObjective(t); },
});

// --- cash pickups ------------------------------------------------------------
const pickups = [];
{
  const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc030 });
  const spots = [[-30, 90], [90, 60], [-90, -60], [150, -180], [-180, 180], [240, 60], [30, -240], [-240, -240]];
  for (const [x, z] of spots) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 1, z);
    scene.add(m);
    pickups.push({ mesh: m, x, z, taken: false });
  }
}

// --- particles, skid marks, muzzle flash --------------------------------------
const particles = [];
const particleGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
function spawnParticles(x, y, z, color, n, spread) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    scene.add(m);
    particles.push({
      mesh: m, life: 0.6 + Math.random() * 0.5,
      vx: (Math.random() - 0.5) * spread, vy: Math.random() * spread * 0.7, vz: (Math.random() - 0.5) * spread,
    });
  }
}
const skidGeo = new THREE.PlaneGeometry(0.5, 1.6);
const skidMat = new THREE.MeshBasicMaterial({ color: 0x181818, transparent: true, opacity: 0.55 });
const skids = [];
function addSkid(x, z, heading) {
  if (skids.length > 120) { const old = skids.shift(); scene.remove(old); }
  const m = new THREE.Mesh(skidGeo, skidMat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = heading;
  m.position.set(x, 0.14, z);
  scene.add(m);
  skids.push(m);
}
const flashLight = new THREE.PointLight(0xffc060, 0, 18);
scene.add(flashLight);
let flashTimer = 0;
let lastBumpAt = -10; // playTime of the last building hit (damage cooldown)

// --- camera ------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function updateCamera(dt) {
  const targetX = state.inCar && state.playerCar ? state.playerCar.x : state.playerX;
  const targetZ = state.inCar && state.playerCar ? state.playerCar.z : state.playerZ;
  const focusY = state.inCar ? 1.6 : 1.7;
  // mouse drag orbits; in a car the camera swings back behind the car
  const md = input.takeMouseDelta();
  state.camYaw -= md.x * 0.005;
  state.camPitch = clamp(state.camPitch + md.y * 0.003, 0.08, 0.9);
  if (state.inCar && state.playerCar) {
    // ease toward directly behind the car instead of snapping to it
    state.camYaw = turnToward(state.camYaw, state.playerCar.heading + Math.PI, dt * 2.2);
  }
  // driving wants a higher, wider view than walking: more city in frame,
  // the car smaller in it
  const dist = state.inCar ? 15 : 9;
  const pitch = state.inCar ? Math.max(state.camPitch, 0.42) : state.camPitch;
  const cx = targetX + Math.sin(state.camYaw) * Math.cos(pitch) * dist;
  const cz = targetZ + Math.cos(state.camYaw) * Math.cos(pitch) * dist;
  const cy = focusY + Math.sin(pitch) * dist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(targetX, focusY, targetZ);
}

// --- menus ---------------------------------------------------------------------
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const overEl = document.getElementById('over');
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');
const continueBtn = document.getElementById('btn-continue');

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function showOnly(el) { for (const e of [menuEl, pauseEl, overEl]) hide(e); if (el) show(el); }

function startGame(fromSave) {
  if (!fromSave) {
    state.cash = 150; state.health = 100; state.ammo = 12;
    state.missionsDone = [];
    state.playerX = 0; state.playerZ = 30; state.playerHeading = 0;
    state.playTime = 0;
    state.stats = { earned: 0, carsStolen: 0, busts: 0 };
    missions.restoreDone([]);
  } else if (save) {
    state.cash = save.cash; state.health = save.health;
    state.missionsDone = save.missionsDone.slice();
    state.playerX = save.player.x; state.playerZ = save.player.z;
    state.playerHeading = save.player.heading;
    state.playTime = save.playTime || 0;
    state.stats = { ...state.stats, ...(save.stats || {}) };
    missions.restoreDone(state.missionsDone);
  }
  state.screen = 'playing';
  state.inCar = false;
  state.playerCar = null;
  police.clearWanted();
  showOnly(null);
  input.clearActions();
  audio.unlock();
  hud.setCash(state.cash);
  hud.setHealth(state.health);
  hud.setStars(0);
  hud.setAmmo(state.ammo);
  hud.setJobs(missions.doneCount, missions.total);
  hud.setObjective(state.missionsDone.length >= missions.total
    ? 'All missions done — free roam. Marta owes you one.'
    : 'Free roam — press M for the next job from Marta.');
  hud.toast(`${GAME_TITLE} — welcome to ${CITY_NAME}. Press M for work.`);
}

function pauseGame() {
  if (state.screen !== 'playing') return;
  state.screen = 'paused';
  showOnly(pauseEl);
  saveNow();
}
function resumeGame() {
  if (state.screen !== 'paused') return;
  state.screen = 'playing';
  showOnly(null);
  audio.unlock();
}
function endRun(title, text) {
  state.screen = 'busted';
  overTitle.textContent = title;
  overText.textContent = text;
  showOnly(overEl);
  audio.busted();
  const fine = Math.min(state.cash, TUNING.bustFine);
  state.cash -= fine;
  state.stats.busts += 1;
  hud.setCash(state.cash);
  state.health = TUNING.respawnHealth;
  police.clearWanted();
  if (state.inCar && state.playerCar) { state.inCar = false; state.playerCar = null; }
  state.playerX = 0; state.playerZ = 30; state.playerHeading = 0;
  saveNow();
}

document.getElementById('btn-new').addEventListener('click', () => { audio.click(); startGame(false); });
continueBtn.addEventListener('click', () => { audio.click(); startGame(true); });
document.getElementById('btn-resume').addEventListener('click', () => { audio.click(); resumeGame(); });
document.getElementById('btn-quit').addEventListener('click', () => {
  audio.click(); state.screen = 'menu'; saveNow(); showOnly(menuEl);
  if (save) continueBtn.classList.remove('hidden');
});
document.getElementById('btn-again').addEventListener('click', () => { audio.click(); state.screen = 'playing'; showOnly(null); });
document.getElementById('btn-mute').addEventListener('click', (e) => {
  const muted = audio.toggleMute();
  e.target.textContent = muted ? '🔇 Muted' : '🔊 Sound on';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && state.screen === 'playing') {
    if (missions.startNext()) saveNow();
    else hud.toast('No jobs right now — all missions done.');
  }
});

function saveNow() {
  save = {
    cash: state.cash, health: state.health, missionsDone: state.missionsDone,
    playerX: state.playerX, playerZ: state.playerZ, playerHeading: state.playerHeading,
    playTime: state.playTime, stats: { ...state.stats },
  };
  writeSave(save);
}

// --- combat --------------------------------------------------------------------
function shoot() {
  if (state.ammo <= 0) { audio.click(); hud.toast('Out of ammo — press R to reload.'); return; }
  state.ammo -= 1;
  hud.setAmmo(state.ammo);
  audio.shot();
  const px = state.inCar && state.playerCar ? state.playerCar.x : state.playerX;
  const pz = state.inCar && state.playerCar ? state.playerCar.z : state.playerZ;
  const dirX = -Math.sin(state.camYaw), dirZ = -Math.cos(state.camYaw);
  flashLight.position.set(px + dirX * 2, 1.6, pz + dirZ * 2);
  flashLight.intensity = 60;
  flashTimer = 0.06;
  // nearest hittable target inside a cone in front of the camera
  let best = null, bd = 45;
  const consider = (x, z, kind, ref) => {
    const dx = x - px, dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d > 45 || d < 1) return;
    const dot = (dx * dirX + dz * dirZ) / d;
    if (dot < 0.94) return;
    if (d < bd) { bd = d; best = { kind, ref, x, z }; }
  };
  for (const p of peds.peds) consider(p.x, p.z, 'ped', p);
  for (const c of traffic.cars) consider(c.x, c.z, 'car', c);
  for (const c of police.cruisers) consider(c.x, c.z, 'police', c);
  if (!best) {
    // a miss still scares the street — witnesses run from gunfire
    peds.fleeFrom(px, pz, 18);
    return;
  }
  spawnParticles(best.x, 1.2, best.z, 0xffd060, 10, 6);
  peds.fleeFrom(best.x, best.z, 22);
  if (best.kind === 'ped') {
    peds.knockDown(best.ref);
    police.addHeat(8);
    hud.toast('A bystander went down — the PD noticed.');
  } else if (best.kind === 'car') {
    best.ref.health -= 34;
    police.addHeat(6);
    if (best.ref.health <= 0) {
      spawnParticles(best.x, 1, best.z, 0x404040, 24, 9);
      best.ref.speed = 0;
    }
  } else {
    best.ref.health -= 25;
    police.addHeat(12);
    if (best.ref.health <= 0) {
      spawnParticles(best.x, 1, best.z, 0x404040, 24, 9);
      best.ref.speed = 0;
    }
  }
}

function punch() {
  audio.punch();
  const p = peds.nearest(state.playerX, state.playerZ, 2.4);
  if (p) {
    peds.knockDown(p);
    police.addHeat(6);
    spawnParticles(p.x, 1.2, p.z, 0xffe0a0, 8, 4);
    hud.toast('You laid one out. Witnesses called it in.');
  }
}

// --- enter / exit car ------------------------------------------------------------
function tryEnterCar() {
  if (state.inCar) {
    // exit: step out beside the car
    const c = state.playerCar;
    state.playerX = c.x + Math.cos(c.heading) * 2.5;
    state.playerZ = c.z - Math.sin(c.heading) * 2.5;
    state.playerHeading = c.heading;
    state.inCar = false;
    state.playerCar = null;
    return;
  }
  const car = traffic.nearestDrivable(state.playerX, state.playerZ, 5);
  if (!car) { hud.toast('No car close enough — walk up to one.'); return; }
  traffic.removeFromTraffic(car);
  state.playerCar = car;
  state.inCar = true;
  state.playerCar.speed = 0;
  state.playerCar.health = Math.max(state.playerCar.health, 60);
  state.stats.carsStolen += 1;
  police.addHeat(10);
  audio.pickup();
  hud.toast('Car taken — the PD logged the theft.');
}

// --- one fixed step ----------------------------------------------------------------
function step(dt) {
  state.playTime += dt;
  const actions = input.takeActions();
  if (actions & ACT_PAUSE) { pauseGame(); return; }
  if (actions & ACT_ENTER) tryEnterCar();
  if (actions & ACT_PUNCH && !state.inCar) punch();
  if (actions & ACT_SHOOT && !state.inCar) shoot();
  if (actions & ACT_HORN && state.inCar) { audio.horn(); peds.fleeFrom(state.playerCar.x, state.playerCar.z, 12); }
  if (actions & ACT_RELOAD) {
    state.ammo = 12; hud.setAmmo(state.ammo); audio.click();
  }

  // --- player movement ---
  if (state.inCar && state.playerCar) {
    const d = input.driveAxis();
    if (sceneParam && state.playerCar.speed < stageCruise) d.throttle = 1;
    const car = state.playerCar;
    car.drive(dt, d.throttle, d.steer, d.brake, d.boost ? TUNING.carBoostTopSpeed : TUNING.carTopSpeed);
    const resolved = city.resolveCircle(car.x, car.z, 2.2);
    if (resolved.x !== car.x || resolved.z !== car.z) {
      const impact = Math.abs(car.speed);
      car.x = resolved.x; car.z = resolved.z;
      car.speed *= 0.4;
      // A hard hit into a building damages the car, not just the paint.
      // One hit per 0.6 s at most: being shoved against a wall by a ram
      // must not stack a hit every frame and insta-wreck the car.
      if (impact > 8 && state.playTime - lastBumpAt > 0.6) {
        lastBumpAt = state.playTime;
        car.health -= Math.min(12, impact * 0.5);
        hud.flashDamage(0.3);
        audio.crash();
        spawnParticles(car.x, 0.8, car.z, 0xd8d8d8, 6, 4);
      }
    }
    car.x = clamp(car.x, -WORLD.half, WORLD.half);
    car.z = clamp(car.z, -WORLD.half, WORLD.half);
    car.sync();
    if (d.brake && Math.abs(car.speed) > 12) {
      addSkid(car.x - Math.sin(car.heading) * 1.6, car.z - Math.cos(car.heading) * 1.6, car.heading);
      if (Math.random() < dt * 8) spawnParticles(car.x, 0.4, car.z, 0xaaaaaa, 1, 2);
      if (Math.random() < dt * 2) audio.skid();
    }
    audio.setEngine(Math.abs(car.speed) / 34, true);
    // running over pedestrians while driving
    const hit = peds.nearest(car.x, car.z, 2.6);
    if (hit && Math.abs(car.speed) > 4) {
      peds.knockDown(hit);
      police.addHeat(10);
      car.speed *= 0.85;
      audio.crash();
    }
    // a wrecked car blows out: smoke, a bang, and Leo bails out on foot
    if (car.health <= 0) {
      spawnParticles(car.x, 1.2, car.z, 0x303030, 30, 10);
      spawnParticles(car.x, 1.2, car.z, 0xff8020, 20, 8);
      audio.whoosh();
      hud.flashDamage(0.5);
      hud.toast('Your ride is wrecked — on foot now, Leo.');
      police.addHeat(15);
      state.playerX = car.x + Math.cos(car.heading) * 3;
      state.playerZ = car.z - Math.sin(car.heading) * 3;
      state.playerHeading = car.heading;
      state.inCar = false;
      state.playerCar = null;
      traffic.removeFromTraffic(car);
      car.remove();
    }
  } else {
    const m = input.moveAxis();
    const sprint = input.sprint() ? TUNING.playerSprintMult : 1;
    const speed = TUNING.playerWalkSpeed * sprint;
    // W moves away from the camera (third-person standard)
    const fx = -Math.sin(state.camYaw), fz = -Math.cos(state.camYaw);
    const rx = -fz, rz = fx;
    const mx = fx * m.forward + rx * m.strafe;
    const mz = fz * m.forward + rz * m.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      state.playerX += (mx / len) * speed * dt;
      state.playerZ += (mz / len) * speed * dt;
      state.playerHeading = Math.atan2(mx / len, mz / len);
      state.walkPhase += dt * speed * 2.2;
    }
    const resolved = city.resolveCircle(state.playerX, state.playerZ, 0.7);
    state.playerX = resolved.x; state.playerZ = resolved.z;
    state.playerX = clamp(state.playerX, -WORLD.half, WORLD.half);
    state.playerZ = clamp(state.playerZ, -WORLD.half, WORLD.half);
    playerMesh.position.set(state.playerX, 0, state.playerZ);
    playerMesh.rotation.y = state.playerHeading;
    playerMesh.userData.legs.position.y = 0.42 + Math.abs(Math.sin(state.walkPhase)) * 0.12;
    playerMesh.visible = true;
    audio.setEngine(0, false);
  }
  playerMesh.visible = !state.inCar;

  // --- pickups ---
  for (const pk of pickups) {
    if (pk.taken) continue;
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 1 + Math.sin(performance.now() / 400 + pk.x) * 0.2;
    const px = state.inCar && state.playerCar ? state.playerCar.x : state.playerX;
    const pz = state.inCar && state.playerCar ? state.playerCar.z : state.playerZ;
    if (Math.hypot(pk.x - px, pk.z - pz) < 2.4) {
      pk.taken = true;
      pk.mesh.visible = false;
      state.cash += TUNING.pickupCash;
      state.stats.earned += TUNING.pickupCash;
      hud.setCash(state.cash);
      audio.pickup();
      hud.toast(`Found street cash +$${TUNING.pickupCash}`);
    }
  }

  // --- world systems ---
  const threats = [{
    x: state.inCar && state.playerCar ? state.playerCar.x : state.playerX,
    z: state.inCar && state.playerCar ? state.playerCar.z : state.playerZ,
    radius: state.inCar ? 14 : 8,
  }];
  traffic.update(dt, null, state.inCar ? state.playerCar : null);
  peds.update(dt, threats);
  const pol = police.update(dt,
    { x: state.playerX, z: state.playerZ },
    state.inCar ? state.playerCar : null,
    () => endRun('BUSTED', 'The Solara PD hauled you in. You paid $100 bail and woke up at the plaza.'),
    () => { hud.flashDamage(0.22); if (Math.random() < dt * 2) audio.crash(); });
  // a ram can shove the player's car sideways into a building — push it
  // back out before the next step reads the collision as a hard impact
  if (state.inCar && state.playerCar) {
    const fixed = city.resolveCircle(state.playerCar.x, state.playerCar.z, 2.2);
    state.playerCar.x = fixed.x; state.playerCar.z = fixed.z;
    // and the car slowly recovers once the cruisers are off its bumper
    if (pol.nearest > 6 && state.playerCar.health < 100) {
      state.playerCar.health = Math.min(100, state.playerCar.health + 2 * dt);
    }
    state.playerCar.sync();
  }
  // the siren wails only while the PD is hunting, louder the closer they are
  audio.setSiren(police.wanted > 0, pol.nearest);

  // --- missions ---
  missions.update(dt, {
    x: state.inCar && state.playerCar ? state.playerCar.x : state.playerX,
    z: state.inCar && state.playerCar ? state.playerCar.z : state.playerZ,
    inCar: state.inCar,
    wanted: police.wanted,
  });

  // --- health, wanted, HUD ---
  if (police.wanted === 0 && state.health < 100) state.health = Math.min(100, state.health + TUNING.healthRegenPerSec * dt);
  if (state.health <= 0) { endRun('WASTED', 'Leo went down in Costa Solara. The story continues at the plaza.'); return; }
  hud.setHealth(state.health);
  hud.setStars(police.wanted);
  hud.setJobs(missions.doneCount, missions.total);
  hud.setSpeed(state.inCar && state.playerCar ? Math.abs(state.playerCar.speed) * 3.6 : 0, state.inCar);
  hud.setTimer(missions.timer);
  hud.drawMinimap({
    buildings: city.buildings,
    trafficCars: traffic.cars,
    policeCars: police.cruisers,
    waypoint: missions.waypoint(),
    playerX: state.inCar && state.playerCar ? state.playerCar.x : state.playerX,
    playerZ: state.inCar && state.playerCar ? state.playerCar.z : state.playerZ,
    playerHeading: state.inCar && state.playerCar ? state.playerCar.heading : state.playerHeading,
  });

  // --- particles / flash ---
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 6 * dt;
  }
  if (flashTimer > 0) {
    flashTimer -= dt;
    if (flashTimer <= 0) flashLight.intensity = 0;
  }
  // sun follows the player so shadows stay crisp
  city.sun.position.set(
    (state.inCar && state.playerCar ? state.playerCar.x : state.playerX) + 180,
    220,
    (state.inCar && state.playerCar ? state.playerCar.z : state.playerZ) - 140);
  city.sun.target.position.set(
    state.inCar && state.playerCar ? state.playerCar.x : state.playerX, 0,
    state.inCar && state.playerCar ? state.playerCar.z : state.playerZ);
  city.sun.target.updateMatrixWorld();

  // --- autosave ---
  state.saveTimer += dt;
  if (state.saveTimer > 15) { state.saveTimer = 0; saveNow(); }
}

// --- staged scenes for screenshots -----------------------------------------------
// ?scene=drive|foot|mission|chase starts the game already in motion, with
// the world dressed around the player: traffic on the roads, people on the
// sidewalks, police behind the car on a chase. The camera sits behind the
// car (heading + PI) or over the player's shoulder on foot. After staging,
// the world settles for 90 fixed steps with the car's cruise speed held,
// so traffic, peds and police are in frame and the HUD is live.
const STAGED_SCENES = ['drive', 'foot', 'mission', 'chase'];

function stagePlayerCar(x, z, heading, color, cruise) {
  const car = createCar(scene, x, z, heading, color, false);
  state.playerCar = car;
  state.inCar = true;
  car.speed = cruise;
  state.playerX = x; state.playerZ = z;
  state.camYaw = heading + Math.PI; // directly behind the car
  return car;
}

function stageScene(name) {
  startGame(false);
  state.screen = 'playing';
  showOnly(null);
  let cruise = 0;
  if (name === 'drive') {
    // Cover shot: a chase — two stars, cruisers in the mirror, a job on
    // the HUD, traffic ahead on the avenue.
    cruise = 18;
    stagePlayerCar(0, 60, Math.PI, 0xd83838, cruise);
    police.setWanted(2);
    police.spawnNear(0, 60, Math.PI);
    police.spawnNear(0, 60, Math.PI * 0.9);
    traffic.seedNear(0, 60, 6);
    peds.gatherNear(0, 60, 5);
    missions.startById('sunset-run');
  } else if (name === 'foot') {
    // On foot on the x=0 avenue, facing the Solara Tower 30 m up the road.
    // (The avenue palms stand at x=+-8 and the lamps at x=+-30, so this
    // sightline stays clear of both.)
    state.playerX = 0; state.playerZ = 30; state.playerHeading = Math.PI / 2;
    state.camYaw = Math.PI * 1.5;
    peds.gatherNear(0, 30, 8);
    traffic.seedNear(0, 30, 4);
  } else if (name === 'mission') {
    // Sunset Run in progress: in a car, timer running, marina beacon ahead.
    // Heading -PI/2 drives -x along the z=300 avenue, straight at the
    // marina waypoint at (-240, 300), so the beacon is in frame — and the
    // car starts 140 m out, so it is still en route (not already done)
    // when the shot is taken.
    cruise = 16;
    stagePlayerCar(-100, 300, -Math.PI * 0.5, 0x2f6fd8, cruise);
    traffic.seedNear(-100, 300, 5);
    peds.gatherNear(-100, 300, 4);
    missions.startById('sunset-run');
  } else if (name === 'chase') {
    // Full heat: three stars, cruisers on the tail, Heat Escape running.
    // Heading PI drives straight down the x=60 avenue, so the chase
    // stays on the road instead of grinding through buildings. The
    // cruisers flank (one each side, one centre) so the shot shows the
    // player car instead of one cruiser filling the frame behind it.
    cruise = 22;
    stagePlayerCar(60, -60, Math.PI, 0xf0c030, cruise);
    police.setWanted(3);
    police.spawnNear(60, -60, Math.PI + 0.35);
    police.spawnNear(60, -60, Math.PI - 0.35);
    police.spawnNear(60, -60, Math.PI);
    traffic.seedNear(60, -60, 6);
    missions.startById('heat-escape');
  }
  // let the world settle a moment so traffic, peds and police are in frame
  stageCruise = cruise;
  for (let i = 0; i < 90; i++) {
    step(STEP);
    // no keys are held while staging, so drag would slow the car to a
    // crawl — hold the cruise speed so the shot shows motion
    if (state.playerCar) state.playerCar.speed = cruise;
  }
  updateCamera(0.016);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// --- main loop ---------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (state.screen === 'playing') {
    acc += dt;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    updateCamera(dt);
    renderer.render(scene, camera);
  } else if (state.screen === 'menu') {
    if (input.takeActions() & ACT_START) { startGame(false); return; }
    // slow orbit over the city behind the title screen
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 160, 90, Math.cos(t * 0.05) * 160);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
}

// --- boot ----------------------------------------------------------------------------
// Alt-Tabbing away mid-chase pauses instead of leaving the player to be
// busted while the tab is hidden.
window.addEventListener('blur', () => { if (state.screen === 'playing') pauseGame(); });

if (save) continueBtn.classList.remove('hidden');
hud.setCash(state.cash);
hud.setHealth(state.health);
hud.setStars(0);
hud.setAmmo(state.ammo);
hud.setJobs(missions.doneCount, missions.total);
hud.setObjective('Press Enter or click New Game.');
playerMesh.position.set(state.playerX, 0, state.playerZ);
playerMesh.rotation.y = state.playerHeading;

if (sceneParam) {
  if (STAGED_SCENES.includes(sceneParam)) {
    stageScene(sceneParam);
  } else {
    console.warn(`SOLARA HEAT: unknown ?scene=${sceneParam}, showing the menu.`);
  }
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}
