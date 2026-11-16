// Input: keyboard state, mouse look deltas, pointer lock, and the transient
// "pressed this step" edges the sim consumes. No DOM work beyond lock requests.
export function bindInput(canvas) {
  const pad = {
    keys: new Set(),
    pressed: new Set(),   // consumed once per sim step
    lookDX: 0, lookDY: 0,
    mouseDown: false, mouseDownEdge: false,
    mouseRight: false,
    locked: false,
    onLockChange: null, onFirstGesture: null,
    _gestured: false,
  };
  const CODE = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', ShiftLeft: 'walk', ShiftRight: 'walk', ControlLeft: 'crouch', KeyR: 'reload', Space: 'jump', KeyB: 'buy', KeyE: 'use', KeyG: 'grenade' };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = CODE[e.code];
    if (k) { pad.keys.add(k); pad.pressed.add(k); }
    if (e.code.startsWith('Digit')) pad.pressed.add('digit' + e.code.slice(5));
    if (e.code === 'Space') e.preventDefault();
    if (!pad._gestured) { pad._gestured = true; pad.onFirstGesture && pad.onFirstGesture(); }
  });
  addEventListener('keyup', (e) => {
    const k = CODE[e.code];
    if (k) pad.keys.delete(k);
  });
  addEventListener('blur', () => { pad.keys.clear(); pad.mouseDown = false; });
  document.addEventListener('pointerlockchange', () => {
    pad.locked = document.pointerLockElement === canvas;
    pad.onLockChange && pad.onLockChange(pad.locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!pad.locked) return;
    pad.lookDX += e.movementX || 0;
    pad.lookDY += e.movementY || 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!pad._gestured) { pad._gestured = true; pad.onFirstGesture && pad.onFirstGesture(); }
    if (e.button === 0) { pad.mouseDown = true; pad.mouseDownEdge = true; }
    if (e.button === 2) pad.mouseRight = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) pad.mouseDown = false;
    if (e.button === 2) pad.mouseRight = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  pad.lock = () => { try { canvas.requestPointerLock(); } catch { /* headless: no lock */ } };
  pad.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  pad.endStep = () => { pad.pressed.clear(); pad.lookDX = 0; pad.lookDY = 0; pad.mouseDownEdge = false; };
  return pad;
}
