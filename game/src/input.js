// Keyboard and mouse input. Arrows (or WASD) fly the plane, Shift/Ctrl work
// the throttle, and the mouse steers too: hold the left button and the plane
// banks and pitches toward the pointer, like a yoke you can see.

export function makeInput() {
  return {
    keys: new Set(),
    mouse: { x: 0, y: 0, down: false, active: false },
    pitch: 0, // -1..1, positive = nose up
    roll: 0, // -1..1, positive = bank right
    throttleDelta: 0, // -1..1 per second of throttle travel
  };
}

const KEYMAP = {
  ArrowUp: 'pitchUp',
  KeyW: 'pitchUp',
  ArrowDown: 'pitchDown',
  KeyS: 'pitchDown',
  ArrowLeft: 'rollLeft',
  KeyA: 'rollLeft',
  ArrowRight: 'rollRight',
  KeyD: 'rollRight',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  KeyE: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
  KeyQ: 'throttleDown',
};

export function attachInput(input, canvas, onKey) {
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    input.keys.add(event.code);
    if (onKey) onKey(event.code);
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
  });
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = event.clientX - rect.left;
    input.mouse.y = event.clientY - rect.top;
    input.mouse.active = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) input.mouse.down = true;
  });
  window.addEventListener('mouseup', () => {
    input.mouse.down = false;
  });
}

// Fold the raw keys and the mouse into one control vector each frame.
export function pollInput(input, width, height) {
  const has = (name) => {
    for (const code of input.keys) {
      if (KEYMAP[code] === name) return true;
    }
    return false;
  };
  let pitch = 0;
  let roll = 0;
  if (has('pitchUp')) pitch += 1;
  if (has('pitchDown')) pitch -= 1;
  if (has('rollLeft')) roll -= 1;
  if (has('rollRight')) roll += 1;
  if (input.mouse.down && input.mouse.active) {
    const dx = (input.mouse.x - width / 2) / (width / 2);
    const dy = (input.mouse.y - height * 0.5) / (height / 2);
    roll += Math.max(-1, Math.min(1, dx * 1.4));
    pitch += Math.max(-1, Math.min(1, -dy * 1.2));
  }
  let throttleDelta = 0;
  if (has('throttleUp')) throttleDelta += 1;
  if (has('throttleDown')) throttleDelta -= 1;
  input.pitch = Math.max(-1, Math.min(1, pitch));
  input.roll = Math.max(-1, Math.min(1, roll));
  input.throttleDelta = throttleDelta;
}
