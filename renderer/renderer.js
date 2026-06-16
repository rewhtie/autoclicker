let clickCount = 0;
let isRunning = false;

const $ = (id) => document.getElementById(id);
const displaySelect = $("display-select");
const posX = $("pos-x");
const posY = $("pos-y");
const useCenter = $("use-center");
const intervalInput = $("interval");
const intervalDisplay = $("interval-display");
const toggleBtn = $("toggle-btn");
const statusBadge = $("status-badge");
const clickCountEl = $("click-count");
const pickBtn = $("pick-position");

async function loadDisplays() {
  const displays = await window.electronAPI.getDisplays();
  displaySelect.innerHTML = displays.map(d =>
    `<option value="${d.index}">${d.label} (${d.sizeLabel})${d.isPrimary ? " — 主屏" : ""}</option>`
  ).join("");
}

async function loadSettings() {
  const s = await window.electronAPI.getSettings();
  if (displaySelect.options.length > 0) {
    displaySelect.value = s.displayIndex || 0;
  }
  posX.value = s.x;
  posY.value = s.y;
  useCenter.checked = s.useCenter;
  intervalInput.value = s.intervalMs;
  updateIntervalDisplay(s.intervalMs);
  if (s.isClicking) updateUI(true);
}

function updateIntervalDisplay(ms) {
  intervalDisplay.textContent = (ms / 1000).toFixed(1) + " 秒";
}

function updateUI(running) {
  isRunning = running;
  toggleBtn.textContent = running ? "停止点击" : "开始点击";
  toggleBtn.classList.toggle("running", running);
  statusBadge.textContent = running ? "点击中" : "停止";
  statusBadge.classList.toggle("active", running);
  posX.disabled = running;
  posY.disabled = running;
  useCenter.disabled = running;
  intervalInput.disabled = running;
  pickBtn.disabled = running;
  displaySelect.disabled = running;
}

function getSettings() {
  return {
    x: parseInt(posX.value) || 0,
    y: parseInt(posY.value) || 0,
    useCenter: useCenter.checked,
    intervalMs: parseInt(intervalInput.value) || 5000,
    displayIndex: parseInt(displaySelect.value) || 0,
  };
}

toggleBtn.addEventListener("click", async () => {
  await window.electronAPI.updateSettings(getSettings());
  const result = await window.electronAPI.toggleClicking();
  updateUI(result.isClicking);
});

useCenter.addEventListener("change", async () => {
  if (useCenter.checked) {
    const idx = parseInt(displaySelect.value) || 0;
    const c = await window.electronAPI.getScreenCenter(idx);
    posX.value = c.x;
    posY.value = c.y;
  }
});

displaySelect.addEventListener("change", async () => {
  const idx = parseInt(displaySelect.value) || 0;
  await window.electronAPI.updateSettings({ displayIndex: idx });
  if (useCenter.checked) {
    const c = await window.electronAPI.getScreenCenter(idx);
    posX.value = c.x;
    posY.value = c.y;
  }
});

intervalInput.addEventListener("input", () => {
  updateIntervalDisplay(parseInt(intervalInput.value) || 5000);
});

pickBtn.addEventListener("click", async () => {
  useCenter.checked = false;
  const idx = parseInt(displaySelect.value) || 0;
  // Persist the selected display first so main can target the right monitor
  await window.electronAPI.updateSettings({ displayIndex: idx, useCenter: false });
  window.electronAPI.openOverlay(idx);
});

window.electronAPI.onPositionUpdated((coords) => {
  posX.value = coords.x;
  posY.value = coords.y;
});

window.electronAPI.onClickPerformed((data) => {
  clickCount = data.count;
  clickCountEl.textContent = clickCount;
});

window.electronAPI.onStateChanged((data) => {
  updateUI(data.isClicking);
});

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); toggleBtn.click(); }
});

(async () => {
  await loadDisplays();
  await loadSettings();
})();
