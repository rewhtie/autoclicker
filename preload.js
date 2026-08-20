const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getDisplays: () => ipcRenderer.invoke("get-displays"),
  getScreenCenter: (idx) => ipcRenderer.invoke("get-screen-center", idx),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  updateSettings: (s) => ipcRenderer.invoke("update-settings", s),
  toggleClicking: () => ipcRenderer.invoke("toggle-clicking"),
  openOverlay: (idx) => ipcRenderer.invoke("open-overlay", idx),
  closeOverlay: () => ipcRenderer.invoke("close-overlay"),

  // Multi-point picking: overlay sends the full list when the user finishes.
  pickPositions: (points) => ipcRenderer.send("positions-picked", { points }),

  // Schemes
  listSchemes:    ()       => ipcRenderer.invoke("schemes-list"),
  selectScheme:   (id)     => ipcRenderer.invoke("schemes-select", id),
  saveScheme:     ()       => ipcRenderer.invoke("schemes-save"),
  createScheme:   (name, fromCurrent) => ipcRenderer.invoke("schemes-create", { name, fromCurrent }),
  renameScheme:   (id, name) => ipcRenderer.invoke("schemes-rename", { id, name }),
  deleteScheme:   (id)     => ipcRenderer.invoke("schemes-delete", id),

  onPositionsUpdated: (cb) => { ipcRenderer.on("positions-updated", (_e, d) => cb(d)); },
  onClickPerformed:   (cb) => { ipcRenderer.on("click-performed", (_e, d) => cb(d)); },
  onKeyPerformed:     (cb) => { ipcRenderer.on("key-performed", (_e, d) => cb(d)); },
  onStateChanged:     (cb) => { ipcRenderer.on("state-changed", (_e, d) => cb(d)); },
  onOverlayReady:     (cb) => { ipcRenderer.on("overlay-ready", (_e, d) => cb(d)); },
  onRipple:           (cb) => { ipcRenderer.on("ripple", (_e, d) => cb(d)); }
});
