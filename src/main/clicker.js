const koffi = require('koffi');
const { int, uint, uint64, int64, long: koffiLong } = koffi.types;

const user32 = koffi.load('user32.dll');

const POINT = koffi.struct('POINT', { x: koffiLong, y: koffiLong });
const HWND = koffi.pointer(koffi.types.void);

const windowFromPoint = user32.func('WindowFromPoint', HWND, [POINT]);
const screenToClient = user32.func('ScreenToClient', int, [HWND, koffi.pointer(POINT)]);
const sendMsg = user32.func('SendMessageW', int64, [HWND, uint, uint64, int64]);

const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP   = 0x0202;
const MK_LBUTTON     = 0x0001;

let clickCount = 0;
let clickTimer = null;
let onClickCallback = null;
let onTickCallback = null;
let pointCursor = 0; // index into the current points list, for round-robin

function doClick(x, y) {
  const hwnd = windowFromPoint({ x, y });
  if (!hwnd) return;

  const outPt = koffi.alloc(POINT, 1);
  koffi.encode(outPt, POINT, { x, y });
  screenToClient(hwnd, koffi.address(outPt));

  const { x: cx, y: cy } = koffi.decode(outPt, POINT);
  const lParam = (cy << 16) | (cx & 0xFFFF);
  sendMsg(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lParam);
  sendMsg(hwnd, WM_LBUTTONUP, 0, lParam);

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

module.exports = {
  startClicking,
  stopClicking,
  isClicking,
  getClickCount,
  setOnClickCallback,
  setOnTickCallback,
};
