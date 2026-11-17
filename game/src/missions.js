// SOLARA HEAT — missions.js
// One job: the story. Three missions from fixer Marta Solis, each with
// objectives, a 3D waypoint beacon, a timer where it matters, and a cash
// reward. The story: Leo Marin, fresh out of the Solara docks, owes the
// harbour crew — Marta's jobs are his way out.

import * as THREE from 'three';
import { MISSION_REWARDS } from './config.js';

const MISSIONS = [
  {
    id: 'wheels',
    title: '1 — Wheels Up',
    giver: 'Marta Solis',
    brief: 'Leo, you need wheels before the docks crew finds you. Take any car on the street — walk up and press E — then bring it to my garage.',
    steps: [
      { text: 'Steal a car — walk up to one and press E', check: (c) => c.inCar, reward: 0 },
      { text: 'Drive to Marta\u2019s garage', point: { x: 60, z: -120 }, radius: 10, reward: MISSION_REWARDS.wheels },
    ],
  },
  {
    id: 'sunset-run',
    title: '2 — Sunset Run',
    giver: 'Marta Solis',
    brief: 'A package for the marina, and the PD is already sniffing. Drive it there in 90 seconds — and try not to collect stars.',
    steps: [
      { text: 'Get in a car', check: (c) => c.inCar, reward: 0 },
      { text: 'Deliver the package to the marina — 90s!', point: { x: -240, z: 300 }, radius: 12, timer: 90, reward: MISSION_REWARDS['sunset-run'], wanted: 2 },
    ],
  },
  {
    id: 'heat-escape',
    title: '3 — Heat Escape',
    giver: 'Marta Solis',
    brief: 'You lit up the whole precinct, Leo. Three stars and counting. Lose the cruisers, then get to the safehouse by the beach.',
    steps: [
      { text: 'Shake the police — lose all wanted stars', check: (c) => c.wanted === 0, reward: 0, wanted: 3 },
      { text: 'Reach the beach safehouse', point: { x: 180, z: 300 }, radius: 12, reward: MISSION_REWARDS['heat-escape'] },
    ],
  },
  {
    id: 'harbour-debt',
    title: '4 — Harbour Debt',
    giver: 'Marta Solis',
    brief: 'Last one, Leo. The harbour crew wants their money, and they want it in a fast car. Take any car, outrun one star of heat, and bring $1,200 of wheels to the docks.',
    steps: [
      { text: 'Steal a car — any car will do', check: (c) => c.inCar, reward: 0 },
      { text: 'Lose the heat — get back to zero stars', check: (c) => c.wanted === 0, reward: 0, wanted: 1 },
      { text: 'Deliver the car to the docks', point: { x: -240, z: 240 }, radius: 12, timer: 120, reward: MISSION_REWARDS['harbour-debt'] },
    ],
  },
];

export function createMissions(scene) {
  // Waypoint beacon: a tall glowing pillar + a floating ring, easy to spot.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc030, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
  );
  pillar.position.y = 30;
  beacon.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc030 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  let active = null;      // mission object currently running
  let stepIndex = 0;
  let timer = 0;          // seconds left on a timed step, 0 = no timer
  let done = [];          // ids finished (restored from save)
  let banner = '';        // current objective text for the HUD
  let onEvent = null;     // main.js hooks: { cash(n), wanted(n), toast(t), sfx(name) }

  function currentStep() {
    return active ? active.steps[stepIndex] : null;
  }
  function waypoint() {
    const s = currentStep();
    return s && s.point ? s.point : null;
  }
  function setBanner(text) { banner = text; if (onEvent) onEvent.objective(text); }

  function startMission(m) {
    active = m;
    stepIndex = 0;
    timer = 0;
    const s = currentStep();
    if (s && s.wanted) onEvent.wanted(s.wanted);
    setBanner(`${m.title} — ${s.text}`);
    if (onEvent) onEvent.toast(`${m.giver}: ${m.brief}`);
    if (onEvent) onEvent.sfx('mission');
  }

  function finishMission() {
    done.push(active.id);
    if (onEvent) {
      onEvent.toast(`Mission complete — ${active.title}`);
      onEvent.sfx('mission');
    }
    active = null;
    beacon.visible = false;
    setBanner(done.length >= MISSIONS.length
      ? 'All missions done — free roam. Marta owes you one.'
      : 'Free roam — press M for the next job.');
  }

  function failMission(reason) {
    if (onEvent) onEvent.toast(`Mission failed — ${reason}`);
    active = null;
    beacon.visible = false;
    setBanner('Free roam — press M for the next job.');
  }

  // One step is done: pay its reward, move to the next step (applying its
  // wanted level), or finish the mission. The point and check branches in
  // update() both end here instead of duplicating this logic.
  function advanceStep() {
    stepIndex += 1;
    timer = 0;
    if (stepIndex >= active.steps.length) { finishMission(); return; }
    const ns = currentStep();
    if (ns && ns.wanted) onEvent.wanted(ns.wanted);
    setBanner(`${active.title} — ${ns.text}`);
    if (onEvent) onEvent.sfx('pickup');
  }

  return {
    list: MISSIONS,
    get total() { return MISSIONS.length; },
    get doneCount() { return done.length; },
    get active() { return active; },
    get done() { return done; },
    get banner() { return banner; },
    get timer() { return timer; },
    waypoint,
    bind(hooks) { onEvent = hooks; },
    restoreDone(ids) { done = ids.slice(); },
    // Walk away from a job mid-mission (Esc → menu does this too).
    abort() {
      if (!active) return false;
      failMission('job abandoned');
      return true;
    },
    startNext() {
      if (active) return false;
      const next = MISSIONS.find((m) => !done.includes(m.id));
      if (!next) return false;
      startMission(next);
      return true;
    },
    startById(id) {
      if (active) return false;
      const m = MISSIONS.find((x) => x.id === id);
      if (!m) return false;
      startMission(m);
      return true;
    },
    update(dt, ctx) {
      if (!active) return;
      const s = currentStep();
      if (!s) { finishMission(); return; }
      if (s.timer && timer === 0) timer = s.timer;
      if (timer > 0) {
        timer -= dt;
        if (timer <= 0) { failMission('time ran out'); return; }
      }
      if (s.point) {
        beacon.visible = true;
        beacon.position.set(s.point.x, 0, s.point.z);
        ring.rotation.z += dt * 1.5;
        const d = Math.hypot(ctx.x - s.point.x, ctx.z - s.point.z);
        if (d < s.radius) {
          if (s.reward && onEvent) onEvent.cash(s.reward);
          advanceStep();
        }
      } else if (s.check && s.check(ctx)) {
        advanceStep();
      }
    },
  };
}
