const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');

const { getSettings, updateSettings, getScreenCenter } = require('./settings');
const clicker = require('./clicker');
const { createOverlayWindow, closeOverlay } = require('./overlay');
const { openFeedbackWindow, closeFeedbackWindow, spawnRipple } = require('./feedback');

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 620,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: 'AutoClicker',
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function toggleClicking() {
  if (clicker.isClicking()) {
    clicker.stopClicking();
    closeFeedbackWindow();
  } else {
    openFeedbackWindow(getSettings().displayIndex);
    clicker.startClicking(() => getSettings());
  }
  const state = clicker.isClicking();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-changed', { isClicking: state });
  }
  return { isClicking: state };
}

function setupIPC() {
  ipcMain.handle('get-displays', () => {
    return screen.getAllDisplays().map((d, i) => ({
      index: i,
      label: d.label || ('显示器 ' + (i + 1)),
      bounds: d.bounds,
      isPrimary: d.id === screen.getPrimaryDisplay().id,
      sizeLabel: d.bounds.width + 'x' + d.bounds.height,
    }));
  });

  ipcMain.handle('get-screen-center', (_e, displayIndex) => getScreenCenter(displayIndex));
  ipcMain.handle('get-settings', () => ({ ...getSettings(), isClicking: clicker.isClicking() }));
  ipcMain.handle('update-settings', (_e, s) => {
    updateSettings(s);
    if (clicker.isClicking()) {
      clicker.stopClicking();
      // Re-open feedback on the (possibly new) target display.
      openFeedbackWindow(getSettings().displayIndex);
      clicker.startClicking(() => getSettings());
    }
    return getSettings();
  });
  ipcMain.handle('toggle-clicking', () => toggleClicking());
  ipcMain.handle('open-overlay', (_e, displayIndex) => {
    const idx = typeof displayIndex === 'number' ? displayIndex : getSettings().displayIndex;
    createOverlayWindow(idx);
    return true;
  });
  ipcMain.handle('close-overlay', () => { closeOverlay(); return true; });
}

function registerHotkeys() {
  globalShortcut.register('F6', () => { toggleClicking(); });
}

clicker.setOnClickCallback((count) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('click-performed', { count });
  }
});

clicker.setOnTickCallback(({ x, y }) => {
  spawnRipple(x, y);
});

ipcMain.on('position-picked', (_e, coords) => {
  updateSettings({ useCenter: false, x: coords.x, y: coords.y });
  closeOverlay();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('position-updated', { x: coords.x, y: coords.y });
  }
});

app.whenReady().then(() => {
  setupIPC();
  createMainWindow();
  registerHotkeys();
});

app.on('window-all-closed', () => {
  clicker.stopClicking();
  closeFeedbackWindow();
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
