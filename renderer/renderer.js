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
const showClickEffect = $("show-click-effect");
const schemeDialogBackdrop = $("scheme-dialog-backdrop");
const schemeDialogTitle = $("scheme-dialog-title");
const schemeNameInput = $("scheme-name-input");
const schemeCopyRow = $("scheme-copy-row");
const schemeCopyCurrent = $("scheme-copy-current");
const schemeDialogEffect = $("scheme-dialog-effect");
const schemeDialogCancel = $("scheme-dialog-cancel");
const schemeDialogSubmit = $("scheme-dialog-submit");

let schemeDialogMode = "new";

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
  showClickEffect.checked = s.showClickEffect !== false;
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
  showClickEffect.disabled = running;
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
    showClickEffect: showClickEffect.checked,
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

function openSchemeDialog(mode) {
  schemeDialogMode = mode;
  const current = schemeSelect.options[schemeSelect.selectedIndex];
  const currentName = current ? current.textContent : "";

  if (mode === "new") {
    schemeDialogTitle.textContent = "新建方案";
    schemeDialogSubmit.textContent = "创建";
    schemeNameInput.value = "新方案";
    schemeCopyRow.classList.remove("hidden");
    schemeCopyCurrent.checked = true;
    schemeDialogEffect.checked = showClickEffect.checked;
  } else {
    schemeDialogTitle.textContent = "编辑方案";
    schemeDialogSubmit.textContent = "保存";
    schemeNameInput.value = currentName;
    schemeCopyRow.classList.add("hidden");
    schemeCopyCurrent.checked = true;
    schemeDialogEffect.checked = showClickEffect.checked;
  }

  schemeDialogBackdrop.classList.remove("hidden");
  schemeNameInput.focus();
  schemeNameInput.select();
}

function closeSchemeDialog() {
  schemeDialogBackdrop.classList.add("hidden");
}

schemeNew.addEventListener("click", () => {
  openSchemeDialog("new");
});

schemeRename.addEventListener("click", () => {
  openSchemeDialog("edit");
});

schemeDialogCancel.addEventListener("click", closeSchemeDialog);

schemeDialogBackdrop.addEventListener("click", (e) => {
  if (e.target === schemeDialogBackdrop) closeSchemeDialog();
});

schemeDialogBackdrop.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSchemeDialog();
  if (e.key === "Enter") schemeDialogSubmit.click();
});

schemeDialogSubmit.addEventListener("click", async () => {
  const name = schemeNameInput.value.trim();
  if (!name) {
    schemeNameInput.focus();
    return;
  }

  if (schemeDialogMode === "new") {
    // Persist current form first so copied schemes include unsaved edits.
    await window.electronAPI.updateSettings(getCurrentFormSettings());
    await window.electronAPI.createScheme(name, schemeCopyCurrent.checked);
    // For a blank new scheme, apply the dialog's effect switch after creation.
    if (!schemeCopyCurrent.checked) {
      await window.electronAPI.updateSettings({ showClickEffect: schemeDialogEffect.checked });
      await window.electronAPI.saveScheme();
    }
  } else {
    showClickEffect.checked = schemeDialogEffect.checked;
    await window.electronAPI.updateSettings(getCurrentFormSettings());
    await window.electronAPI.renameScheme(currentSchemeId, name);
    await window.electronAPI.saveScheme();
  }

  closeSchemeDialog();
  await loadSchemes();
  await loadSettings();
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

showClickEffect.addEventListener("change", async () => {
  await window.electronAPI.updateSettings({ showClickEffect: showClickEffect.checked });
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
