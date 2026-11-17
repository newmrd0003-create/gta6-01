// SOLARA HEAT — save
// Progress in localStorage. A save carries cash, health, finished jobs,
// where Leo stands, play time and lifetime totals — never the live world,
// which the seed rebuilds on every load. Versioned: a stale or broken
// save is reshaped into the current form instead of breaking the boot.

import { SAVE_KEY } from './config.js';

export const SAVE_VER = 2;

export function blankSave() {
  return {
    version: SAVE_VER,
    cash: 150,
    health: 100,
    missionsDone: [],
    player: { x: 0, z: 30, heading: 0 },
    storySeen: false,
    playTime: 0,
    // Lifetime totals, shown on the pause screen later and kept across
    // new games so Leo's history survives a restart.
    stats: { earned: 0, carsStolen: 0, busts: 0 },
    savedAt: 0,
  };
}

// Lift any older save shape into the current one; stray fields are dropped.
function upgradeSave(data) {
  const fresh = blankSave();
  if (!data || typeof data !== 'object') return fresh;
  const out = { ...fresh, ...data, version: SAVE_VER };
  if (!Array.isArray(out.missionsDone)) out.missionsDone = [];
  if (!out.player || typeof out.player.x !== 'number') out.player = fresh.player;
  if (!out.stats || typeof out.stats.earned !== 'number') out.stats = fresh.stats;
  out.cash = typeof out.cash === 'number' ? out.cash : fresh.cash;
  out.health = typeof out.health === 'number' ? out.health : fresh.health;
  out.playTime = typeof out.playTime === 'number' ? out.playTime : 0;
  return out;
}

export function hasSave() {
  try { return window.localStorage.getItem(SAVE_KEY) !== null; }
  catch { return false; }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return upgradeSave(data);
  } catch {
    return null;
  }
}

export function storeSave(s) {
  try {
    const data = {
      version: SAVE_VER,
      cash: Math.round(s.cash),
      health: Math.round(s.health),
      missionsDone: s.missionsDone.slice(),
      player: { x: s.playerX, z: s.playerZ, heading: s.playerHeading },
      storySeen: true,
      playTime: Math.round(s.playTime),
      stats: {
        earned: Math.round(s.stats?.earned || 0),
        carsStolen: Math.round(s.stats?.carsStolen || 0),
        busts: Math.round(s.stats?.busts || 0),
      },
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function wipeSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage off */ }
}
