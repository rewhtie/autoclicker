const { screen } = require('electron');

function getDisplayByIndex(index) {
  const all = screen.getAllDisplays();
  if (typeof index !== 'number' || index < 0 || index >= all.length) {
    return screen.getPrimaryDisplay();
  }
  return all[index];
}

function getScreenCenter(displayIndex) {
  const idx = typeof displayIndex === 'number' ? displayIndex : settings.displayIndex;
  const d = getDisplayByIndex(idx);
  return {
    x: Math.round(d.bounds.x + d.bounds.width / 2),
    y: Math.round(d.bounds.y + d.bounds.height / 2),
  };
}

const defaultSettings = () => ({
  x: 0,
  y: 0,
  useCenter: true,
  intervalMs: 5000,
  displayIndex: 0,
});

let settings = defaultSettings();

function getSettings() {
  return { ...settings };
}

function updateSettings(partial) {
  settings = { ...settings, ...partial };
  return settings;
}

function resetSettings() {
  settings = defaultSettings();
}

module.exports = {
  getScreenCenter,
  getDisplayByIndex,
  getSettings,
  updateSettings,
  resetSettings,
};
