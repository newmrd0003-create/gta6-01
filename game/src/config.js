// SOLARA HEAT — config
// Every number the game tunes on lives here, plus the seeded dice that
// keeps Costa Solara identical from one load to the next. Nothing in this
// file draws or moves anything; it just answers questions the systems ask.

export const TITLE = 'SOLARA HEAT';
export const TAGLINE = 'An open-world crime story in Costa Solara';
export const CITY_NAME = 'Costa Solara';
export const SAVE_KEY = 'solara-heat-save-v1';

// The playable square, the street grid laid over it, and the road size.
export const GRID = {
  half: 330,   // city runs -330..330 on both axes
  step: 60,    // metres between street centrelines
  road: 12,    // asphalt width
  curb: 9,     // pavement margin inside a block
};

// Feel numbers shared by the player, the cars, the police and the missions.
// Tune here and the whole game retunes at once.
export const BALANCE = {
  walk: 5.2,        // metres per second on foot
  sprint: 1.7,      // multiplier while sprinting
  carTop: 34,       // player car top speed, m/s
  boostTop: 40,     // top speed while boosting
  cruiseLo: 8,      // slowest traffic cruise
  cruiseHi: 13,     // fastest traffic cruise
  copFar: 33,       // cruiser top speed while far away
  copNear: 24,      // cruiser top speed up close
  coolOff: 12,      // unseen seconds to drop one wanted star
  bustHold: 1.6,    // seconds a cruiser must touch Leo on foot to bust him
  regen: 2,         // health per second while the heat is off
  pickup: 50,       // cash in one street pickup
  fine: 100,        // bail taken on a bust
  respawnHp: 60,    // health Leo wakes up with after a bust
};

// What Marta pays, per job, in story order.
export const JOB_PAY = {
  wheels: 300,
  'sunset-run': 600,
  'heat-escape': 900,
  'harbour-debt': 1200,
};

// Late-afternoon sun, teal sea, pastel towers.
export const PALETTE = {
  sky: 0x87bfe8,
  haze: 0xcfe4ef,
  sun: 0xffd9a0,
  ground: 0x8a8f7a,
  asphalt: 0x3a3d42,
  walkway: 0xb9b3a4,
  sand: 0xe8d29a,
  sea: 0x1e7fa8,
  tower: [0xe8b48a, 0xd9a0a8, 0xa8c8d8, 0xf0d9a0, 0xb8c8a8, 0xd8b8d8, 0x9fb8c8],
  paint: [0xd83838, 0x2f6fd8, 0xf0c030, 0x38b878, 0xe8e8e8, 0x222226, 0xd87030, 0x7a4fd0],
  shirt: [0xe05050, 0x50a0e0, 0x50c080, 0xe0c050, 0xc050c0, 0xffffff, 0x303030],
};

// Small seeded dice (mulberry32): same seed, same stream, every load.
export function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The one shared stream. City, traffic and walkers all drink from it in a
// fixed order, so the world comes out the same on every boot.
export const worldRng = mulberry(20261117);

export function choose(r, list) {
  return list[Math.floor(r() * list.length)];
}
export function between(r, lo, hi) {
  return lo + r() * (hi - lo);
}
export function clampNum(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function mix(a, b, t) {
  return a + (b - a) * t;
}
export function gap2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

// Fold any angle into (-PI, PI]. All steering and camera follow goes
// through here so nothing ever disagrees about which way to turn.
export function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
export function angleBetween(from, to) {
  return normAngle(to - from);
}
// Step `from` toward `to` by no more than `step` radians.
export function steerTo(from, to, step) {
  const d = angleBetween(from, to);
  if (Math.abs(d) <= step) return to;
  return from + Math.sign(d) * step;
}
export function cashStr(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

// Street centrelines, -300..300 in steps of 60.
export function streetLines() {
  const out = [];
  for (let v = -300; v <= 300; v += GRID.step) out.push(v);
  return out;
}
// Is a point on asphalt (within half a road width of a centreline)?
export function isStreet(x, z) {
  const hw = GRID.road / 2 + 1;
  const nearLine = (v) => {
    const m = ((v + 300) % GRID.step + GRID.step) % GRID.step;
    return Math.min(m, GRID.step - m) <= hw;
  };
  return nearLine(x) || nearLine(z);
}
// Nearest street centreline coordinate to a value.
export function snapStreet(v) {
  return Math.round((v + 300) / GRID.step) * GRID.step - 300;
}
