const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getDisplays: () => ipcRenderer.invoke("get-displays"),
  getScreenCenter: (idx) => ipcRenderer.invoke("get-screen-center", idx),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  updateSettings: (s) => ipcRenderer.invoke("update-settings", s),
  toggleClicking: () => ipcRenderer.invoke("toggle-clicking"),
  openOverlay: (idx) => ipcRenderer.invoke("open-overlay", idx),
  closeOverlay: () => ipcRenderer.invoke("close-overlay"),
  pickPosition: (coords) => ipcRenderer.send("position-picked", coords),
  onPositionUpdated: (cb) => { ipcRenderer.on("position-updated", (_e, d) => cb(d)); },
  onClickPerformed: (cb) => { ipcRenderer.on("click-performed", (_e, d) => cb(d)); },
  onStateChanged: (cb) => { ipcRenderer.on("state-changed", (_e, d) => cb(d)); },
  onOverlayReady: (cb) => { ipcRenderer.on("overlay-ready", (_e, d) => cb(d)); },
  onRipple: (cb) => { ipcRenderer.on("ripple", (_e, d) => cb(d)); }
});
