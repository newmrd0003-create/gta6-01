// SOLARA HEAT — input.js
// One job: keyboard + mouse state for the whole game. Held keys are read
// every frame; one-shot presses (enter car, punch, reload, pause, horn)
// are queued as flags and taken once by the loop, so a press between
// frames is never lost or counted twice. Pointer drag orbits the camera;
// a plain click fires the pistol.

export const ACT_ENTER = 1;   // E — enter / exit a car
export const ACT_PUNCH = 2;   // F — punch
export const ACT_RELOAD = 4;  // R — reload pistol
export const ACT_PAUSE = 8;   // Esc / P — pause
export const ACT_SHOOT = 16;  // mouse click — fire pistol
export const ACT_START = 32;  // Enter / Space — start from a menu
export const ACT_HORN = 64;   // H — honk the horn (in a car)

const PREVENT_DEFAULT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// One-shot key -> action flag. Held keys never set a flag here.
const ONE_SHOT_KEYS = {
  KeyE: ACT_ENTER,
  KeyF: ACT_PUNCH,
  KeyR: ACT_RELOAD,
  KeyH: ACT_HORN,
  Escape: ACT_PAUSE,
  KeyP: ACT_PAUSE,
  Enter: ACT_START,
  Space: ACT_START,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0, mouseDY = 0;
  let dragging = false;
  let lastX = 0, lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    const flag = ONE_SHOT_KEYS[event.code];
    if (flag) actions |= flag;
    if (PREVENT_DEFAULT.includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  // Losing focus must not leave a key stuck down (Alt-Tab mid-drive).
  window.addEventListener('blur', () => { keys.clear(); dragging = false; });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true; lastX = event.clientX; lastY = event.clientY;
    if (event.button === 0) actions |= ACT_SHOOT;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  const anyOf = (...codes) => codes.some((c) => keys.has(c));

  return {
    held(code) { return keys.has(code); },
    heldAny(...codes) { return anyOf(...codes); },
    // WASD / arrows: forward, strafe, back.
    moveAxis() {
      const f = (anyOf('KeyW', 'ArrowUp') ? 1 : 0) - (anyOf('KeyS', 'ArrowDown') ? 1 : 0);
      const s = (anyOf('KeyD', 'ArrowRight') ? 1 : 0) - (anyOf('KeyA', 'ArrowLeft') ? 1 : 0);
      return { forward: f, strafe: s };
    },
    // Car: W/S throttle, A/D steer, Space handbrake, Shift boost.
    driveAxis() {
      const throttle = (anyOf('KeyW', 'ArrowUp') ? 1 : 0) - (anyOf('KeyS', 'ArrowDown') ? 1 : 0);
      const steer = (anyOf('KeyA', 'ArrowLeft') ? 1 : 0) - (anyOf('KeyD', 'ArrowRight') ? 1 : 0);
      return {
        throttle, steer,
        brake: keys.has('Space'),
        boost: anyOf('ShiftLeft', 'ShiftRight'),
      };
    },
    sprint() { return anyOf('ShiftLeft', 'ShiftRight'); },
    takeMouseDelta() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    peekActions() { return actions; },
    // Drop every queued press — used when a menu opens so a stale Enter
    // does not instantly start (or skip) the game behind it.
    clearActions() { actions = 0; },
    reset() { keys.clear(); actions = 0; mouseDX = 0; mouseDY = 0; dragging = false; },
  };
}
