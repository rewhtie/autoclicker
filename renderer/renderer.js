let clickCount = 0;
let isRunning = false;
let currentPoints = []; // [{x,y}], cached from settings
let currentSchemeId = null;

const $ = (id) => document.getElementById(id);
const displaySelect = $("display-select");
const useCenter     = $("use-center");
const intervalInput = $("interval");
const intervalDisplay = $("interval-display");
const toggleBtn     = $("toggle-btn");
const statusBadge   = $("status-badge");
const clickCountEl  = $("click-count");
const pickBtn       = $("pick-position");
const clearBtn      = $("clear-points");
const pointList     = $("point-list");
const schemeSelect  = $("scheme-select");
const schemeSave    = $("scheme-save");
const schemeNew     = $("scheme-new");
const schemeRename  = $("scheme-rename");
const schemeDelete  = $("scheme-delete");

// --- Displays ---------------------------------------------------------------

async function loadDisplays() {
  const displays = await window.electronAPI.getDisplays();
  displaySelect.innerHTML = displays.map(d =>
    `<option value="${d.index}">${d.label} (${d.sizeLabel})${d.isPrimary ? " — 主屏" : ""}</option>`
  ).join("");
}

// --- Point list -------------------------------------------------------------

function renderPoints() {
  if (!currentPoints || currentPoints.length === 0) {
    pointList.innerHTML = `<li class="point-empty">尚未拾取任何点</li>`;
    return;
  }
  pointList.innerHTML = currentPoints.map((p, i) => `
    <li class="point-item">
      <span class="point-index">${i + 1}</span>
      <span class="point-coord">(${p.x}, ${p.y})</span>
      <button class="point-remove" data-i="${i}" title="删除">×</button>
    </li>
  `).join("");
  pointList.querySelectorAll(".point-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      const i = parseInt(btn.dataset.i, 10);
      currentPoints.splice(i, 1);
      renderPoints();
      await window.electronAPI.updateSettings({ points: currentPoints });
    });
  });
}

// --- Settings (current scheme runtime view) ---------------------------------

async function loadSettings() {
  const s = await window.electronAPI.getSettings();
  if (displaySelect.options.length > 0) {
    displaySelect.value = s.displayIndex || 0;
  }
  useCenter.checked = !!s.useCenter;
  intervalInput.value = s.intervalMs;
  updateIntervalDisplay(s.intervalMs);
  currentPoints = Array.isArray(s.points) ? s.points.slice() : [];
  renderPoints();
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
  useCenter.disabled = running;
  intervalInput.disabled = running;
  pickBtn.disabled = running;
  clearBtn.disabled = running;
  displaySelect.disabled = running;
  schemeSelect.disabled = running;
  schemeSave.disabled = running;
  schemeNew.disabled = running;
  schemeRename.disabled = running;
  schemeDelete.disabled = running;
  pointList.querySelectorAll(".point-remove").forEach(b => b.disabled = running);
}

function getCurrentFormSettings() {
  return {
    points: currentPoints.slice(),
    useCenter: useCenter.checked,
    intervalMs: parseInt(intervalInput.value) || 5000,
    displayIndex: parseInt(displaySelect.value) || 0,
  };
}

// --- Schemes ----------------------------------------------------------------

async function loadSchemes() {
  const data = await window.electronAPI.listSchemes();
  currentSchemeId = data.currentId;
  schemeSelect.innerHTML = data.schemes.map(s =>
    `<option value="${s.id}">${escapeHtml(s.name)}</option>`
  ).join("");
  schemeSelect.value = currentSchemeId;
  schemeDelete.disabled = data.schemes.length <= 1;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;",
  })[c]);
}

schemeSelect.addEventListener("change", async () => {
  const id = schemeSelect.value;
  await window.electronAPI.selectScheme(id);
  currentSchemeId = id;
  await loadSettings();
});

schemeSave.addEventListener("click", async () => {
  // Push current form state into settings, then persist into the scheme.
  await window.electronAPI.updateSettings(getCurrentFormSettings());
  await window.electronAPI.saveScheme();
  flashButton(schemeSave, "已保存");
});

schemeNew.addEventListener("click", async () => {
  const name = prompt("新方案名称：", "新方案");
  if (name === null) return;
  // Push current form state first so "新建（基于当前）"语义更直观.
  await window.electronAPI.updateSettings(getCurrentFormSettings());
  const fromCurrent = confirm("使用当前设置（点位、间隔、显示器）作为新方案的初始值？\n\n确定 = 复用当前设置\n取消 = 使用默认空白方案");
  await window.electronAPI.createScheme(name.trim() || "新方案", fromCurrent);
  await loadSchemes();
  await loadSettings();
});

schemeRename.addEventListener("click", async () => {
  const current = schemeSelect.options[schemeSelect.selectedIndex];
  const oldName = current ? current.textContent : "";
  const name = prompt("重命名方案：", oldName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  await window.electronAPI.renameScheme(currentSchemeId, trimmed);
  await loadSchemes();
});

schemeDelete.addEventListener("click", async () => {
  if (!confirm("删除当前方案？该操作不可恢复。")) return;
  const result = await window.electronAPI.deleteScheme(currentSchemeId);
  if (!result.ok) {
    alert("无法删除：至少要保留一个方案。");
    return;
  }
  await loadSchemes();
  await loadSettings();
});

// --- Toggle / hot reload ----------------------------------------------------

toggleBtn.addEventListener("click", async () => {
  await window.electronAPI.updateSettings(getCurrentFormSettings());
  const result = await window.electronAPI.toggleClicking();
  updateUI(result.isClicking);
});

useCenter.addEventListener("change", async () => {
  await window.electronAPI.updateSettings({ useCenter: useCenter.checked });
});

displaySelect.addEventListener("change", async () => {
  const idx = parseInt(displaySelect.value) || 0;
  await window.electronAPI.updateSettings({ displayIndex: idx });
});

intervalInput.addEventListener("input", async () => {
  const v = parseInt(intervalInput.value) || 5000;
  updateIntervalDisplay(v);
  await window.electronAPI.updateSettings({ intervalMs: v });
});

pickBtn.addEventListener("click", async () => {
  const idx = parseInt(displaySelect.value) || 0;
  await window.electronAPI.updateSettings({ displayIndex: idx });
  window.electronAPI.openOverlay(idx);
});

clearBtn.addEventListener("click", async () => {
  currentPoints = [];
  renderPoints();
  await window.electronAPI.updateSettings({ points: [] });
});

window.electronAPI.onPositionsUpdated((data) => {
  currentPoints = Array.isArray(data && data.points) ? data.points.slice() : [];
  useCenter.checked = false;
  renderPoints();
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

function flashButton(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    if (!isRunning) btn.disabled = false;
  }, 900);
}

(async () => {
  await loadDisplays();
  await loadSchemes();
  await loadSettings();
})();
