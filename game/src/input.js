// SOLARA HEAT — input
// Keyboard and mouse for the whole game. Keys held down are polled every
// frame; single presses (steal a car, punch, reload, pause, horn) land in
// a one-shot queue that the loop takes exactly once, so a press between
// frames is neither lost nor counted twice. Dragging orbits the camera; a
// plain left click fires the pistol.

export const K_ENTER = 1;   // E — get in / out of a car
export const K_PUNCH = 2;   // F — punch
export const K_RELOAD = 4;  // R — reload the pistol
export const K_PAUSE = 8;   // Esc / P — pause
export const K_FIRE = 16;   // mouse click — shoot
export const K_START = 32;  // Enter / Space — start from a menu
export const K_HORN = 64;   // H — honk (while driving)

const STOP_SCROLL = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// One-shot key -> queued action. Held keys never queue anything here.
const PRESS_KEYS = {
  KeyE: K_ENTER,
  KeyF: K_PUNCH,
  KeyR: K_RELOAD,
  KeyH: K_HORN,
  Escape: K_PAUSE,
  KeyP: K_PAUSE,
  Enter: K_START,
  Space: K_START,
};

export function makeControls(canvas) {
  const held = new Set();
  let queued = 0;
  let dragX = 0, dragY = 0;
  let dragging = false;
  let px = 0, py = 0;

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    held.add(ev.code);
    const flag = PRESS_KEYS[ev.code];
    if (flag) queued |= flag;
    if (STOP_SCROLL.includes(ev.code)) ev.preventDefault();
  });
  window.addEventListener('keyup', (ev) => held.delete(ev.code));
  // Alt-Tab must never leave a key stuck down mid-chase.
  window.addEventListener('blur', () => { held.clear(); dragging = false; });

  canvas.addEventListener('pointerdown', (ev) => {
    dragging = true;
    px = ev.clientX; py = ev.clientY;
    if (ev.button === 0) queued |= K_FIRE;
  });
  window.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    dragX += ev.clientX - px;
    dragY += ev.clientY - py;
    px = ev.clientX; py = ev.clientY;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  const anyHeld = (...codes) => codes.some((c) => held.has(c));

  return {
    down(code) { return held.has(code); },
    any(...codes) { return anyHeld(...codes); },
    // WASD / arrows on foot: forward, strafe, back.
    walk() {
      const fwd = (anyHeld('KeyW', 'ArrowUp') ? 1 : 0) - (anyHeld('KeyS', 'ArrowDown') ? 1 : 0);
      const side = (anyHeld('KeyD', 'ArrowRight') ? 1 : 0) - (anyHeld('KeyA', 'ArrowLeft') ? 1 : 0);
      return { forward: fwd, strafe: side };
    },
    // In a car: W/S throttle, A/D steering, Space handbrake, Shift boost.
    drive() {
      const gas = (anyHeld('KeyW', 'ArrowUp') ? 1 : 0) - (anyHeld('KeyS', 'ArrowDown') ? 1 : 0);
      const wheel = (anyHeld('KeyA', 'ArrowLeft') ? 1 : 0) - (anyHeld('KeyD', 'ArrowRight') ? 1 : 0);
      return {
        throttle: gas, steer: wheel,
        brake: held.has('Space'),
        boost: anyHeld('ShiftLeft', 'ShiftRight'),
      };
    },
    boosting() { return anyHeld('ShiftLeft', 'ShiftRight'); },
    mouse() {
      const d = { x: dragX, y: dragY };
      dragX = 0; dragY = 0;
      return d;
    },
    take() {
      const got = queued;
      queued = 0;
      return got;
    },
    peek() { return queued; },
    // Throw away queued presses — a menu opening must not eat a stale
    // Enter and start (or skip) the game behind it.
    clear() { queued = 0; },
    wipe() { held.clear(); queued = 0; dragX = 0; dragY = 0; dragging = false; },
  };
}
