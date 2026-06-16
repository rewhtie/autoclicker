const { BrowserWindow } = require('electron');
const path = require('path');
const { getDisplayByIndex } = require('./settings');

let feedbackWindow = null;
let currentDisplayBounds = null;

function openFeedbackWindow(displayIndex) {
  const target = getDisplayByIndex(displayIndex);
  const { bounds } = target;

  // If already open on the same display, keep it.
  if (feedbackWindow && !feedbackWindow.isDestroyed()) {
    if (currentDisplayBounds &&
        currentDisplayBounds.x === bounds.x &&
        currentDisplayBounds.y === bounds.y &&
        currentDisplayBounds.width === bounds.width &&
        currentDisplayBounds.height === bounds.height) {
      return;
    }
    closeFeedbackWindow();
  }

  feedbackWindow = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  currentDisplayBounds = { ...bounds };

  feedbackWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  feedbackWindow.setAlwaysOnTop(true, 'screen-saver');
  feedbackWindow.setIgnoreMouseEvents(true, { forward: false });

  feedbackWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'feedback.html'));
  feedbackWindow.once('ready-to-show', () => {
    // showInactive avoids stealing focus from the target window we click into.
    feedbackWindow.showInactive();
  });

  feedbackWindow.on('closed', () => {
    feedbackWindow = null;
    currentDisplayBounds = null;
  });
}

function closeFeedbackWindow() {
  if (feedbackWindow && !feedbackWindow.isDestroyed()) {
    feedbackWindow.destroy();
  }
  feedbackWindow = null;
  currentDisplayBounds = null;
}

// Spawn a ripple at a global DIP coordinate. Converts to display-local px
// before sending to renderer.
function spawnRipple(globalX, globalY) {
  if (!feedbackWindow || feedbackWindow.isDestroyed() || !currentDisplayBounds) return;
  const localX = Math.round(globalX - currentDisplayBounds.x);
  const localY = Math.round(globalY - currentDisplayBounds.y);
  if (localX < 0 || localY < 0 ||
      localX > currentDisplayBounds.width || localY > currentDisplayBounds.height) {
    return;
  }
  feedbackWindow.webContents.send('ripple', { x: localX, y: localY });
}

module.exports = {
  openFeedbackWindow,
  closeFeedbackWindow,
  spawnRipple,
};
