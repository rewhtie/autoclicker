const koffi = require('koffi');
const { int, uint } = koffi.types;

const user32 = koffi.load('user32.dll');

// Mouse click is injected at the hardware-input layer (mouse_event wraps
// SendInput) so it reaches games/DirectInput and exclusive-fullscreen windows
// that ignore windowed WM_LBUTTONDOWN / WM_LBUTTONUP messages.
const setCursorPos = user32.func('SetCursorPos', int, [int, int]);
const mouse_event = user32.func('mouse_event', 'void', [uint, uint, uint, uint, 'void*']);

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP   = 0x0004;

// Keyboard simulation goes to the foreground window (global).
const keybd_event = user32.func('keybd_event', 'void', [uint, uint, uint, 'void*']);
const KEYEVENTF_KEYUP = 0x0002;

let clickCount = 0;
let clickTimer = null;
let onClickCallback = null;
let onTickCallback = null;
let pointCursor = 0; // index into the current points list, for round-robin

let keyCount = 0;
let keyTimer = null;
let onKeyCallback = null;

function doClick(x, y) {
  // x/y are already physical screen coordinates (see startClicking's DIP →
  // physical conversion). Move the real cursor and inject a global click.
  setCursorPos(x, y);
  mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, null);
  mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, null);

  clickCount++;
  if (onClickCallback) onClickCallback(clickCount);
}

// Resolve which DIP point to click next. Returns null if there is nothing
// reasonable to click (e.g. multi-point mode with empty list).
function resolveNextPoint(s) {
  const pts = Array.isArray(s.points) ? s.points : [];
  if (pts.length > 0) {
    const p = pts[pointCursor % pts.length];
    pointCursor = (pointCursor + 1) % pts.length;
    return { x: p.x, y: p.y };
  }
  if (s.useCenter) {
    const { getScreenCenter } = require('./settings');
    return getScreenCenter(s.displayIndex);
  }
  return null;
}

function startClicking(settings) {
  if (clickTimer) return;
  clickCount = 0;
  pointCursor = 0;

  function tick() {
    const s = settings();
    const target = resolveNextPoint(s);
    if (!target) return;
    const { x, y } = target;
    // x/y here are DIP (electron screen API). Convert to physical for
    // Win32 SendMessage / WindowFromPoint, otherwise on HiDPI / scaled
    // secondary monitors the click lands on the wrong window.
    const { screen } = require('electron');
    const phys = screen.dipToScreenPoint({ x, y });
    doClick(Math.round(phys.x), Math.round(phys.y));
    // Notify visual feedback (in DIP, which is what overlay windows use).
    if (onTickCallback) onTickCallback({ x, y });
  }

  tick();
  clickTimer = setInterval(tick, settings().intervalMs);
}

function stopClicking() {
  if (clickTimer) {
    clearInterval(clickTimer);
    clickTimer = null;
  }
  clickCount = 0;
  pointCursor = 0;
}

function isClicking() {
  return clickTimer !== null;
}

function getClickCount() {
  return clickCount;
}

function setOnClickCallback(cb) {
  onClickCallback = cb;
}

function setOnTickCallback(cb) {
  onTickCallback = cb;
}

// --- Keyboard pressing ---------------------------------------------------------

function pressKey(vk) {
  keybd_event(vk, 0, 0, null);
  keybd_event(vk, 0, KEYEVENTF_KEYUP, null);
  keyCount++;
  if (onKeyCallback) onKeyCallback(keyCount);
}

function startKeyPressing(settings) {
  if (keyTimer) return;
  keyCount = 0;

  function poll() {
    const s = settings();
    const vk = Number.isFinite(s.keyCode) ? s.keyCode : 0x20;
    pressKey(vk);
  }

  poll();
  keyTimer = setInterval(poll, settings().keyIntervalMs);
}

function stopKeyPressing() {
  if (keyTimer) {
    clearInterval(keyTimer);
    keyTimer = null;
  }
  keyCount = 0;
}

function isKeyPressing() {
  return keyTimer !== null;
}

function getKeyCount() {
  return keyCount;
}

function setOnKeyCallback(cb) {
  onKeyCallback = cb;
}

module.exports = {
  startClicking,
  stopClicking,
  isClicking,
  getClickCount,
  setOnClickCallback,
  setOnTickCallback,
  startKeyPressing,
  stopKeyPressing,
  isKeyPressing,
  getKeyCount,
  setOnKeyCallback,
};
