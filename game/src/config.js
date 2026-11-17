// SOLARA HEAT — config.js
// One job: every tunable number, name and palette for the game, plus the
// seeded random generator so the city is identical on every load.
export const GAME_TITLE = 'SOLARA HEAT';
export const GAME_SUBTITLE = 'An open-world crime story in Costa Solara';
export const CITY_NAME = 'Costa Solara';
export const SAVE_KEY = 'solara-heat-save-v1';

export const WORLD = {
  half: 330,          // playable city half-size (x and z, in metres)
  roadStep: 60,       // distance between road centrelines
  roadWidth: 12,
  blockInset: 9,      // sidewalk margin inside a block
};

// Difficulty / pacing numbers the other systems share, so a tune in one
// place retunes the whole game instead of a magic number in each file.
export const TUNING = {
  playerWalkSpeed: 5.2,
  playerSprintMult: 1.7,
  carTopSpeed: 34,        // m/s, player car (boost 40)
  carBoostTopSpeed: 40,
  trafficCruiseMin: 8,
  trafficCruiseMax: 13,
  policeTopSpeedFar: 33,
  policeTopSpeedNear: 24,
  wantedCoolSeconds: 12,  // unseen for this long drops one star
  bustHoldSeconds: 1.6,   // cruiser touching the player on foot
  healthRegenPerSec: 2,
  pickupCash: 50,
  bustFine: 100,
  respawnHealth: 60,
};

// Mission rewards, in story order — missions.js reads these, so the payout
// lives here with the rest of the game's numbers.
export const MISSION_REWARDS = { wheels: 300, 'sunset-run': 600, 'heat-escape': 900, 'harbour-debt': 1200 };

// Sun-soaked late-afternoon palette: warm sun, teal sea, pastel towers.
export const PALETTE = {
  sky: 0x87bfe8,
  fog: 0xcfe4ef,
  sun: 0xffd9a0,
  ground: 0x8a8f7a,
  asphalt: 0x3a3d42,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d29a,
  sea: 0x1e7fa8,
  building: [0xe8b48a, 0xd9a0a8, 0xa8c8d8, 0xf0d9a0, 0xb8c8a8, 0xd8b8d8, 0x9fb8c8],
  car: [0xd83838, 0x2f6fd8, 0xf0c030, 0x38b878, 0xe8e8e8, 0x222226, 0xd87030, 0x7a4fd0],
  pedShirt: [0xe05050, 0x50a0e0, 0x50c080, 0xe0c050, 0xc050c0, 0xffffff, 0x303030],
};

// Seeded RNG (mulberry32) — same city, traffic and peds every load.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = makeRng(20261117);

export function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
export function rand(r, lo, hi) { return lo + r() * (hi - lo); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
// Shortest signed turn from angle `from` to angle `to`, in (-PI, PI].
// Every steering / camera-follow in the game uses this one helper instead
// of its own wrap loop, so the turn direction can never disagree.
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
export function angleDiff(from, to) { return wrapAngle(to - from); }
// Turn `from` toward `to` by at most `maxStep` radians this frame.
export function turnToward(from, to, maxStep) {
  const d = angleDiff(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}
export function formatCash(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

// Road centrelines, from -300 to +300 in steps of 60.
export function roadLines() {
  const lines = [];
  for (let v = -300; v <= 300; v += WORLD.roadStep) lines.push(v);
  return lines;
}
// Is a point on a road (within half the road width of a centreline)?
export function onRoad(x, z) {
  const hw = WORLD.roadWidth / 2 + 1;
  const near = (v) => {
    const m = ((v + 300) % WORLD.roadStep + WORLD.roadStep) % WORLD.roadStep;
    return Math.min(m, WORLD.roadStep - m) <= hw;
  };
  return near(x) || near(z);
}
// Nearest road centreline coordinate to a value.
export function snapRoad(v) {
  return Math.round((v + 300) / WORLD.roadStep) * WORLD.roadStep - 300;
}
