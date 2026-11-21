// Keyboard and mouse state, read by the loop each frame. Keys are tracked by code so layout
// does not matter; the mouse feeds the third-person camera through pointer lock, and the left
// button is the trigger. One-shot actions (pause, enter car, confirm) are queued as edges so a
// held key never repeats them.

export const ACTION_PAUSE = 1;
export const ACTION_ENTER = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_RESTART = 8;

const KEY_ACTIONS = {
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  KeyF: ACTION_ENTER,
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyR: ACTION_RESTART,
};

export function createInput(canvas) {
  const down = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let firing = false;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    down.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) {
      actions |= action;
      if (event.code === 'Space') event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => down.delete(event.code));
  window.addEventListener('blur', () => {
    down.clear();
    firing = false;
  });

  canvas.addEventListener('click', () => {
    if (!locked && document.body.classList.contains('playing')) canvas.requestPointerLock?.();
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0 && locked) firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
  });

  return {
    /** Held movement axes: x is strafe (-1 left, +1 right), z is forward (+1 fwd, -1 back). */
    move() {
      let x = 0;
      let z = 0;
      if (down.has('KeyA') || down.has('ArrowLeft')) x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1;
      if (down.has('KeyW') || down.has('ArrowUp')) z += 1;
      if (down.has('KeyS') || down.has('ArrowDown')) z -= 1;
      return { x, z };
    },
    run() {
      return down.has('ShiftLeft') || down.has('ShiftRight');
    },
    firing() {
      return firing;
    },
    /** Mouse movement since the last frame, and clears it. */
    takeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    /** One-shot actions pressed since the last frame, and clears them. */
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    locked() {
      return locked;
    },
    unlock() {
      if (locked) document.exitPointerLock?.();
    },
  };
}
