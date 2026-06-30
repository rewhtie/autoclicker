const { app, screen } = require('electron');
const fs = require('fs');
const path = require('path');

// --- Display helpers ---------------------------------------------------------

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

// --- Settings (in-memory, current scheme) -----------------------------------

const defaultSettings = () => ({
  // List of click points, in DIP global coordinates. Cycled in order.
  // Empty list + useCenter:true falls back to display center (single click).
  points: [],
  useCenter: true,
  intervalMs: 5000,
  displayIndex: 0,
  showClickEffect: true,
});

let settings = defaultSettings();

function getSettings() {
  // Return a deep-ish clone so callers can't mutate internal state by accident.
  return { ...settings, points: settings.points.map(p => ({ ...p })) };
}

function updateSettings(partial) {
  const next = { ...settings, ...partial };
  if (Array.isArray(next.points)) {
    next.points = next.points
      .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  } else {
    next.points = [];
  }
  settings = next;
  return getSettings();
}

function resetSettings() {
  settings = defaultSettings();
}

// --- Schemes (persisted) -----------------------------------------------------
//
// File layout: { currentId: string, schemes: [Scheme] }
//   Scheme: { id, name, points: [{x,y}], useCenter, intervalMs, displayIndex }
//
// Stored in a project-local `data/` folder per the user's preference:
//  - dev (electron .)        -> <repo>/data/schemes.json   (writable)
//  - packaged                -> <exe-dir>/data/schemes.json (writable, lives
//                              next to the .exe so it survives reinstalls in
//                              the same install dir).
// app.asar is read-only inside the package so we can't store there.

function dataDir() {
  const base = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : app.getAppPath();
  return path.join(base, 'data');
}

function schemesFile() {
  return path.join(dataDir(), 'schemes.json');
}

function ensureDataDir() {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
  } catch (e) {
    // Best-effort. If this fails (read-only volume), schemes won't persist.
    console.warn('[settings] mkdir data failed:', e.message);
  }
}

function genId() {
  // Avoid Math.random for replay-friendliness elsewhere, but it's fine here.
  return 's_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}

function defaultStore() {
  const id = 'default';
  return {
    currentId: id,
    schemes: [
      {
        id,
        name: '默认',
        points: [],
        useCenter: true,
        intervalMs: 5000,
        displayIndex: 0,
        showClickEffect: true,
      },
    ],
  };
}

let store = defaultStore();
let storeLoaded = false;

function sanitizeScheme(s, fallback) {
  const fb = fallback || {};
  return {
    id: typeof s.id === 'string' && s.id ? s.id : (fb.id || genId()),
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : (fb.name || '未命名'),
    points: Array.isArray(s.points)
      ? s.points
          .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
          .map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      : [],
    useCenter: typeof s.useCenter === 'boolean' ? s.useCenter : true,
    intervalMs: Number.isFinite(s.intervalMs) ? Math.max(50, Math.round(s.intervalMs)) : 5000,
    displayIndex: Number.isInteger(s.displayIndex) && s.displayIndex >= 0 ? s.displayIndex : 0,
    showClickEffect: typeof s.showClickEffect === 'boolean'
      ? s.showClickEffect
      : (typeof fb.showClickEffect === 'boolean' ? fb.showClickEffect : true),
  };
}

function loadStore() {
  try {
    const raw = fs.readFileSync(schemesFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.schemes) || parsed.schemes.length === 0) {
      throw new Error('empty or malformed schemes file');
    }
    const schemes = parsed.schemes.map(s => sanitizeScheme(s));
    const currentId = schemes.some(s => s.id === parsed.currentId)
      ? parsed.currentId : schemes[0].id;
    store = { currentId, schemes };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.warn('[settings] load schemes failed, using defaults:', e.message);
    }
    store = defaultStore();
  }
  storeLoaded = true;
  applyCurrentSchemeToSettings();
}

function saveStore() {
  ensureDataDir();
  try {
    const tmp = schemesFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, schemesFile());
  } catch (e) {
    console.warn('[settings] save schemes failed:', e.message);
  }
}

function applyCurrentSchemeToSettings() {
  const cur = store.schemes.find(s => s.id === store.currentId) || store.schemes[0];
  if (!cur) return;
  settings = {
    points: cur.points.map(p => ({ ...p })),
    useCenter: cur.useCenter,
    intervalMs: cur.intervalMs,
    displayIndex: cur.displayIndex,
    showClickEffect: cur.showClickEffect,
  };
}

function ensureLoaded() {
  if (!storeLoaded) loadStore();
}

function listSchemes() {
  ensureLoaded();
  return {
    currentId: store.currentId,
    schemes: store.schemes.map(s => ({ ...s, points: s.points.map(p => ({ ...p })) })),
  };
}

function getCurrentScheme() {
  ensureLoaded();
  const s = store.schemes.find(x => x.id === store.currentId) || store.schemes[0];
  return s ? { ...s, points: s.points.map(p => ({ ...p })) } : null;
}

function selectScheme(id) {
  ensureLoaded();
  if (!store.schemes.some(s => s.id === id)) return getCurrentScheme();
  store.currentId = id;
  applyCurrentSchemeToSettings();
  saveStore();
  return getCurrentScheme();
}

// Persist the current in-memory settings into the active scheme.
function saveCurrentScheme(overrides) {
  ensureLoaded();
  const idx = store.schemes.findIndex(s => s.id === store.currentId);
  if (idx < 0) return null;
  const merged = sanitizeScheme(
    { ...store.schemes[idx], ...settings, ...(overrides || {}) },
    store.schemes[idx],
  );
  store.schemes[idx] = merged;
  saveStore();
  return { ...merged, points: merged.points.map(p => ({ ...p })) };
}

// Create a new scheme (optionally seeded from current settings) and select it.
function createScheme(name, opts) {
  ensureLoaded();
  const seed = (opts && opts.fromCurrent) ? settings : defaultSettings();
  const scheme = sanitizeScheme({
    id: genId(),
    name: (name && name.trim()) || '新方案',
    points: seed.points,
    useCenter: seed.useCenter,
    intervalMs: seed.intervalMs,
    displayIndex: seed.displayIndex,
    showClickEffect: seed.showClickEffect,
  });
  store.schemes.push(scheme);
  store.currentId = scheme.id;
  applyCurrentSchemeToSettings();
  saveStore();
  return { ...scheme, points: scheme.points.map(p => ({ ...p })) };
}

function renameScheme(id, name) {
  ensureLoaded();
  const s = store.schemes.find(x => x.id === id);
  if (!s) return null;
  s.name = (name && name.trim()) || s.name;
  saveStore();
  return { ...s, points: s.points.map(p => ({ ...p })) };
}

function deleteScheme(id) {
  ensureLoaded();
  if (store.schemes.length <= 1) return false; // keep at least one
  const idx = store.schemes.findIndex(s => s.id === id);
  if (idx < 0) return false;
  store.schemes.splice(idx, 1);
  if (store.currentId === id) {
    store.currentId = store.schemes[0].id;
    applyCurrentSchemeToSettings();
  }
  saveStore();
  return true;
}

module.exports = {
  // displays
  getScreenCenter,
  getDisplayByIndex,
  // current settings
  getSettings,
  updateSettings,
  resetSettings,
  // schemes
  listSchemes,
  getCurrentScheme,
  selectScheme,
  saveCurrentScheme,
  createScheme,
  renameScheme,
  deleteScheme,
  ensureLoaded,
};
