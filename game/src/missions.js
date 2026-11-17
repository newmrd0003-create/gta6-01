// SOLARA HEAT — missions
// The story. Four jobs from fixer Marta Solis, each with legs to run, a
// 3D waypoint beacon, a timer where it matters, and cash at the end. The
// story: Leo Marin, fresh out of the Solara docks, owes the harbour crew
// — Marta's jobs are his way out.

import * as THREE from 'three';
import { JOB_PAY } from './config.js';

const JOBS = [
  {
    id: 'wheels',
    name: '1 — Wheels Up',
    from: 'Marta Solis',
    brief: 'Leo, you need wheels before the docks crew catches up with you. Take any car off the street — walk up and press E — then bring it round to my garage.',
    legs: [
      { text: 'Steal a car — walk up to one and press E', done: (c) => c.inCar, pay: 0 },
      { text: 'Drive to Marta\u2019s garage', at: { x: 60, z: -120 }, within: 10, pay: JOB_PAY.wheels },
    ],
  },
  {
    id: 'sunset-run',
    name: '2 — Sunset Run',
    from: 'Marta Solis',
    brief: 'A package for the marina, and the PD is already sniffing around. Get it there in 90 seconds — and try not to pick up stars on the way.',
    legs: [
      { text: 'Get in a car', done: (c) => c.inCar, pay: 0 },
      { text: 'Deliver the package to the marina — 90s!', at: { x: -240, z: 300 }, within: 12, timer: 90, pay: JOB_PAY['sunset-run'], heat: 2 },
    ],
  },
  {
    id: 'heat-escape',
    name: '3 — Heat Escape',
    from: 'Marta Solis',
    brief: 'You lit up the whole precinct, Leo. Three stars and counting. Shake the cruisers off, then get to the safehouse by the beach.',
    legs: [
      { text: 'Shake the police — lose all wanted stars', done: (c) => c.wanted === 0, pay: 0, heat: 3 },
      { text: 'Reach the beach safehouse', at: { x: 180, z: 300 }, within: 12, pay: JOB_PAY['heat-escape'] },
    ],
  },
  {
    id: 'harbour-debt',
    name: '4 — Harbour Debt',
    from: 'Marta Solis',
    brief: 'Last one, Leo. The harbour crew wants their money, and they want it in a fast car. Take any car, outrun one star of heat, and bring $1,200 of wheels to the docks.',
    legs: [
      { text: 'Steal a car — any car will do', done: (c) => c.inCar, pay: 0 },
      { text: 'Lose the heat — get back to zero stars', done: (c) => c.wanted === 0, pay: 0, heat: 1 },
      { text: 'Deliver the car to the docks', at: { x: -240, z: 240 }, within: 12, timer: 120, pay: JOB_PAY['harbour-debt'] },
    ],
  },
];

export function makeStory(scene) {
  // Waypoint beacon: a tall glowing pillar and a floating ring, easy to spot.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc030, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
  pillar.position.y = 30;
  beacon.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc030 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  let active = null;   // job currently running
  let legNo = 0;
  let clock = 0;       // seconds left on a timed leg, 0 = no timer
  let done = [];       // ids finished (restored from the save)
  let banner = '';     // current objective line for the HUD
  let hooks = null;    // main.js plugs in: { cash(n), wanted(n), toast(t), sfx(name) }

  function leg() {
    return active ? active.legs[legNo] : null;
  }
  function target() {
    const s = leg();
    return s && s.at ? s.at : null;
  }
  function show(text) {
    banner = text;
    if (hooks) hooks.objective(text);
  }

  function begin(job) {
    active = job;
    legNo = 0;
    clock = 0;
    const s = leg();
    if (s && s.heat) hooks.wanted(s.heat);
    show(`${job.name} — ${s.text}`);
    if (hooks) hooks.toast(`${job.from}: ${job.brief}`);
    if (hooks) hooks.sfx('mission');
  }

  function finish() {
    done.push(active.id);
    if (hooks) {
      hooks.toast(`Mission complete — ${active.name}`);
      hooks.sfx('mission');
    }
    active = null;
    beacon.visible = false;
    show(done.length >= JOBS.length
      ? 'All missions done — free roam. Marta owes you one.'
      : 'Free roam — press M for the next job.');
  }

  function fail(why) {
    if (hooks) hooks.toast(`Mission failed — ${why}`);
    active = null;
    beacon.visible = false;
    show('Free roam — press M for the next job.');
  }

  // One leg is done: pay its reward, move to the next leg (applying its
  // wanted level), or finish the job. The point legs and the check legs
  // in tick() both end here instead of duplicating this logic.
  function nextLeg() {
    legNo += 1;
    clock = 0;
    if (legNo >= active.legs.length) { finish(); return; }
    const ns = leg();
    if (ns && ns.heat) hooks.wanted(ns.heat);
    show(`${active.name} — ${ns.text}`);
    if (hooks) hooks.sfx('pickup');
  }

  return {
    jobs: JOBS,
    get total() { return JOBS.length; },
    get done() { return done.length; },
    get active() { return active; },
    get doneIds() { return done; },
    get banner() { return banner; },
    get clock() { return clock; },
    target,
    attach(h) { hooks = h; },
    restore(ids) { done = ids.slice(); },
    // Walk away from a job mid-mission (Esc -> menu does this too).
    giveUp() {
      if (!active) return false;
      fail('job abandoned');
      return true;
    },
    next() {
      if (active) return false;
      const job = JOBS.find((m) => !done.includes(m.id));
      if (!job) return false;
      begin(job);
      return true;
    },
    byId(id) {
      if (active) return false;
      const job = JOBS.find((x) => x.id === id);
      if (!job) return false;
      begin(job);
      return true;
    },
    tick(dt, ctx) {
      if (!active) return;
      const s = leg();
      if (!s) { finish(); return; }
      if (s.timer && clock === 0) clock = s.timer;
      if (clock > 0) {
        clock -= dt;
        if (clock <= 0) { fail('time ran out'); return; }
      }
      if (s.at) {
        beacon.visible = true;
        beacon.position.set(s.at.x, 0, s.at.z);
        ring.rotation.z += dt * 1.5;
        const d = Math.hypot(ctx.x - s.at.x, ctx.z - s.at.z);
        if (d < s.within) {
          if (s.pay && hooks) hooks.cash(s.pay);
          nextLeg();
        }
      } else if (s.done && s.done(ctx)) {
        nextLeg();
      }
    },
  };
}
