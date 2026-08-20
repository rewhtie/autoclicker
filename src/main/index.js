const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');

const {
  getSettings, updateSettings, getScreenCenter,
  listSchemes, selectScheme, saveCurrentScheme,
  createScheme, renameScheme, deleteScheme, ensureLoaded,
} = require('./settings');
const clicker = require('./clicker');
const { createOverlayWindow, closeOverlay } = require('./overlay');
const { openFeedbackWindow, closeFeedbackWindow, spawnRipple } = require('./feedback');

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 760,
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

function syncFeedbackWindowForSettings() {
  const s = getSettings();
  if (s.showClickEffect) {
    openFeedbackWindow(s.displayIndex);
  } else {
    closeFeedbackWindow();
  }
}

function isActive() {
  return clicker.isClicking() || clicker.isKeyPressing();
}

function toggleClicking() {
  if (isActive()) {
    stopActive();
  } else {
    startActive();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-changed', { isClicking: isActive() });
  }
  return { isClicking: isActive() };
}

function startActive() {
  const s = getSettings();
  if (s.mode === 'keyboard') {
    clicker.startKeyPressing(() => getSettings());
  } else {
    syncFeedbackWindowForSettings();
    clicker.startClicking(() => getSettings());
  }
}

function stopActive() {
  clicker.stopClicking();
  clicker.stopKeyPressing();
  closeFeedbackWindow();
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
  ipcMain.handle('get-settings', () => ({ ...getSettings(), isClicking: isActive() }));
  ipcMain.handle('update-settings', (_e, s) => {
    updateSettings(s);
    if (isActive()) {
      stopActive();
      startActive();
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

  // --- Schemes -------------------------------------------------------------
  ipcMain.handle('schemes-list', () => listSchemes());
  ipcMain.handle('schemes-select', (_e, id) => {
    if (isActive()) {
      stopActive();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('state-changed', { isClicking: false });
      }
    }
    const cur = selectScheme(id);
    return { current: cur, settings: getSettings() };
  });
  ipcMain.handle('schemes-save', () => saveCurrentScheme());
  ipcMain.handle('schemes-create', (_e, payload) => {
    const name = payload && payload.name;
    const fromCurrent = !!(payload && payload.fromCurrent);
    const cur = createScheme(name, { fromCurrent });
    return { current: cur, settings: getSettings() };
  });
  ipcMain.handle('schemes-rename', (_e, payload) => renameScheme(payload.id, payload.name));
  ipcMain.handle('schemes-delete', (_e, id) => {
    const ok = deleteScheme(id);
    return { ok, list: listSchemes(), settings: getSettings() };
  });
}

function registerHotkeys() {
  globalShortcut.register('F6', () => { toggleClicking(); });
}

clicker.setOnClickCallback((count) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('click-performed', { count });
  }
});

clicker.setOnKeyCallback((count) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('key-performed', { count });
  }
});

clicker.setOnTickCallback(({ x, y }) => {
  spawnRipple(x, y);
});

// Position picking: now sends an array of {x,y} from the overlay when the user
// finishes (right-click). We replace the current scheme's points with the
// picked list and turn off useCenter.
ipcMain.on('positions-picked', (_e, payload) => {
  const points = Array.isArray(payload && payload.points) ? payload.points : [];
  if (points.length === 0) {
    closeOverlay();
    return;
  }
  updateSettings({ useCenter: false, points });
  closeOverlay();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('positions-updated', { points });
  }
});

app.whenReady().then(() => {
  ensureLoaded();
  setupIPC();
  createMainWindow();
  registerHotkeys();
});

app.on('window-all-closed', () => {
  clicker.stopClicking();
  clicker.stopKeyPressing();
  closeFeedbackWindow();
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
