// SOLARA HEAT — save.js
// One job: persist the player's progress to localStorage and read it back.
// A save holds cash, health, missions finished, the player's spot, play
// time and lifetime totals — never the live world, which is rebuilt from
// the seed on every load. Versioned: an old or corrupt save migrates to
// the current shape instead of crashing the boot.

import { SAVE_KEY } from './config.js';

export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    cash: 150,
    health: 100,
    missionsDone: [],
    player: { x: 0, z: 30, heading: 0 },
    storySeen: false,
    playTime: 0,
    // Lifetime totals, shown on the pause screen's next pass and kept
    // across new games so the player's history survives a restart.
    stats: { earned: 0, carsStolen: 0, busts: 0 },
    savedAt: 0,
  };
}

// Bring any older save shape up to date; unknown fields are dropped.
function migrate(data) {
  const base = defaultSave();
  if (!data || typeof data !== 'object') return base;
  const out = { ...base, ...data, version: SAVE_VERSION };
  if (!Array.isArray(out.missionsDone)) out.missionsDone = [];
  if (!out.player || typeof out.player.x !== 'number') out.player = base.player;
  if (!out.stats || typeof out.stats.earned !== 'number') out.stats = base.stats;
  out.cash = typeof out.cash === 'number' ? out.cash : base.cash;
  out.health = typeof out.health === 'number' ? out.health : base.health;
  out.playTime = typeof out.playTime === 'number' ? out.playTime : 0;
  return out;
}

export function hasSave() {
  try { return window.localStorage.getItem(SAVE_KEY) !== null; }
  catch { return false; }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return migrate(data);
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      version: SAVE_VERSION,
      cash: Math.round(state.cash),
      health: Math.round(state.health),
      missionsDone: state.missionsDone.slice(),
      player: { x: state.playerX, z: state.playerZ, heading: state.playerHeading },
      storySeen: true,
      playTime: Math.round(state.playTime),
      stats: {
        earned: Math.round(state.stats?.earned || 0),
        carsStolen: Math.round(state.stats?.carsStolen || 0),
        busts: Math.round(state.stats?.busts || 0),
      },
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage off */ }
}
