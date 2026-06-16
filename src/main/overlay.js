const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { getDisplayByIndex } = require('./settings');

let overlayWindow = null;

function createOverlayWindow(displayIndex) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  const target = getDisplayByIndex(displayIndex);
  const { bounds } = target;

  overlayWindow = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    fullscreen: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  // Some Windows setups need an explicit reposition after construction
  // because BrowserWindow honors the primary work-area on first paint.
  overlayWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'overlay.html'));

  overlayWindow.on('closed', () => { overlayWindow = null; });

  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('overlay-ready', { displayBounds: bounds });
  });
}

function closeOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  overlayWindow = null;
}

function isOverlayOpen() {
  return overlayWindow !== null && !overlayWindow.isDestroyed();
}

module.exports = {
  createOverlayWindow,
  closeOverlay,
  isOverlayOpen,
};
