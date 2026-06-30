# Scheme Dialog and Click Effect Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-window scheme editor dialog for save/new/rename flows and a per-scheme switch for showing or hiding the mouse click effect.

**Architecture:** Keep the existing Electron main/renderer split. Persist the new `showClickEffect` boolean in each scheme through `src/main/settings.js`, expose it through existing settings IPC, and make the main process open the feedback overlay only when the active settings enable it. Implement the dialog entirely in the existing renderer HTML/CSS/JS without adding dependencies.

**Tech Stack:** Electron 42, CommonJS, plain HTML/CSS/JavaScript, existing `koffi` click implementation.

## Global Constraints

- Use the existing CommonJS style; do not convert files to ES modules.
- Do not add new dependencies.
- Scheme data remains project-local per user choice: development uses `<repo>/data/schemes.json`, packaged app uses `<exe-dir>/data/schemes.json`.
- Preserve old scheme files by defaulting missing `showClickEffect` to `true`.
- Keep at least one scheme; deletion of the last scheme remains forbidden.
- The click effect setting belongs to the current scheme, not a global app preference.
- Use the current custom dark UI style; do not introduce browser `prompt`/`confirm` for new or rename flows.

---

## File Structure

- Modify `src/main/settings.js`: add `showClickEffect` to defaults, scheme sanitization, current-settings cloning, save/create behavior.
- Modify `src/main/index.js`: open/close feedback windows based on `showClickEffect`; save current settings before scheme save/rename as needed.
- Modify `renderer/index.html`: add the click-effect checkbox and the custom scheme dialog markup.
- Modify `renderer/renderer.js`: replace `prompt`/`confirm` new/rename flows with dialog logic; include `showClickEffect` in form settings; load/save it per scheme.
- Modify `renderer/style.css`: style the dialog, checkbox rows, and better scheme buttons.
- Modify `preload.js`: existing scheme APIs remain sufficient; no new API needed unless implementation chooses to expose explicit dialog helpers, which it should not.

---

### Task 1: Persist `showClickEffect` in settings and schemes

**Files:**
- Modify: `src/main/settings.js`

**Interfaces:**
- Produces: `getSettings(): { points, useCenter, intervalMs, displayIndex, showClickEffect }`
- Produces: scheme objects include `showClickEffect: boolean`
- Consumes: existing `updateSettings(partial)` and scheme APIs

- [ ] **Step 1: Update the default settings object**

In `src/main/settings.js`, change `defaultSettings` from:

```js
const defaultSettings = () => ({
  // List of click points, in DIP global coordinates. Cycled in order.
  // Empty list + useCenter:true falls back to display center (single click).
  points: [],
  useCenter: true,
  intervalMs: 5000,
  displayIndex: 0,
});
```

to:

```js
const defaultSettings = () => ({
  // List of click points, in DIP global coordinates. Cycled in order.
  // Empty list + useCenter:true falls back to display center (single click).
  points: [],
  useCenter: true,
  intervalMs: 5000,
  displayIndex: 0,
  showClickEffect: true,
});
```

- [ ] **Step 2: Add the field to the default store scheme**

In `defaultStore()`, change the default scheme object from:

```js
      {
        id,
        name: '默认',
        points: [],
        useCenter: true,
        intervalMs: 5000,
        displayIndex: 0,
      },
```

to:

```js
      {
        id,
        name: '默认',
        points: [],
        useCenter: true,
        intervalMs: 5000,
        displayIndex: 0,
        showClickEffect: true,
      },
```

- [ ] **Step 3: Sanitize old and new scheme data**

In `sanitizeScheme(s, fallback)`, add this property to the returned object immediately after `displayIndex`:

```js
    showClickEffect: typeof s.showClickEffect === 'boolean'
      ? s.showClickEffect
      : (typeof fb.showClickEffect === 'boolean' ? fb.showClickEffect : true),
```

The complete returned object should include:

```js
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
```

- [ ] **Step 4: Apply the field from scheme to runtime settings**

In `applyCurrentSchemeToSettings()`, change the assignment from:

```js
  settings = {
    points: cur.points.map(p => ({ ...p })),
    useCenter: cur.useCenter,
    intervalMs: cur.intervalMs,
    displayIndex: cur.displayIndex,
  };
```

to:

```js
  settings = {
    points: cur.points.map(p => ({ ...p })),
    useCenter: cur.useCenter,
    intervalMs: cur.intervalMs,
    displayIndex: cur.displayIndex,
    showClickEffect: cur.showClickEffect,
  };
```

- [ ] **Step 5: Ensure createScheme seeds the field**

In `createScheme(name, opts)`, change the scheme object passed to `sanitizeScheme` from:

```js
  const scheme = sanitizeScheme({
    id: genId(),
    name: (name && name.trim()) || '新方案',
    points: seed.points,
    useCenter: seed.useCenter,
    intervalMs: seed.intervalMs,
    displayIndex: seed.displayIndex,
  });
```

to:

```js
  const scheme = sanitizeScheme({
    id: genId(),
    name: (name && name.trim()) || '新方案',
    points: seed.points,
    useCenter: seed.useCenter,
    intervalMs: seed.intervalMs,
    displayIndex: seed.displayIndex,
    showClickEffect: seed.showClickEffect,
  });
```

- [ ] **Step 6: Run syntax check**

Run:

```bash
node -c src/main/settings.js
```

Expected: no output and exit code 0.

---

### Task 2: Gate feedback overlay on `showClickEffect`

**Files:**
- Modify: `src/main/index.js`

**Interfaces:**
- Consumes: `getSettings().showClickEffect: boolean`
- Produces: click effect appears only when enabled

- [ ] **Step 1: Add a helper to sync feedback window state**

In `src/main/index.js`, after `createMainWindow()` add:

```js
function syncFeedbackWindowForSettings() {
  const s = getSettings();
  if (s.showClickEffect) {
    openFeedbackWindow(s.displayIndex);
  } else {
    closeFeedbackWindow();
  }
}
```

- [ ] **Step 2: Use the helper when starting clicking**

In `toggleClicking()`, change:

```js
  } else {
    openFeedbackWindow(getSettings().displayIndex);
    clicker.startClicking(() => getSettings());
  }
```

to:

```js
  } else {
    syncFeedbackWindowForSettings();
    clicker.startClicking(() => getSettings());
  }
```

- [ ] **Step 3: Use the helper when settings update while running**

In the `update-settings` IPC handler, change:

```js
    if (clicker.isClicking()) {
      clicker.stopClicking();
      // Re-open feedback on the (possibly new) target display.
      openFeedbackWindow(getSettings().displayIndex);
      clicker.startClicking(() => getSettings());
    }
```

to:

```js
    if (clicker.isClicking()) {
      clicker.stopClicking();
      // Re-open or close feedback based on the latest target display and effect setting.
      syncFeedbackWindowForSettings();
      clicker.startClicking(() => getSettings());
    }
```

- [ ] **Step 4: Keep ripple callback safe**

No code change is required in the `setOnTickCallback` block. `spawnRipple(x, y)` already returns if the feedback window is not open:

```js
clicker.setOnTickCallback(({ x, y }) => {
  spawnRipple(x, y);
});
```

- [ ] **Step 5: Run syntax check**

Run:

```bash
node -c src/main/index.js
```

Expected: no output and exit code 0.

---

### Task 3: Add renderer controls and custom scheme dialog markup

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/style.css`

**Interfaces:**
- Produces DOM IDs used by renderer JS:
  - `show-click-effect`
  - `scheme-dialog-backdrop`
  - `scheme-dialog-title`
  - `scheme-name-input`
  - `scheme-copy-row`
  - `scheme-copy-current`
  - `scheme-dialog-effect`
  - `scheme-dialog-cancel`
  - `scheme-dialog-submit`

- [ ] **Step 1: Add the click-effect checkbox to the main form**

In `renderer/index.html`, inside the 点击位置 card, after the `use-center` checkbox row, insert:

```html
    <div class="row">
      <label class="checkbox-label">
        <input type="checkbox" id="show-click-effect" checked>
        显示鼠标点击特效
      </label>
    </div>
```

- [ ] **Step 2: Add the scheme dialog HTML**

In `renderer/index.html`, add this dialog markup after the closing `</div>` for `.container` and before `<script src="renderer.js"></script>`:

```html
<div id="scheme-dialog-backdrop" class="dialog-backdrop hidden">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="scheme-dialog-title">
    <h2 id="scheme-dialog-title">编辑方案</h2>
    <label class="field-label" for="scheme-name-input">方案名称</label>
    <input type="text" id="scheme-name-input" class="text-input" maxlength="40" autocomplete="off">

    <label class="checkbox-label dialog-check" id="scheme-copy-row">
      <input type="checkbox" id="scheme-copy-current" checked>
      复制当前配置
    </label>

    <label class="checkbox-label dialog-check">
      <input type="checkbox" id="scheme-dialog-effect" checked>
      显示鼠标点击特效
    </label>

    <div class="dialog-actions">
      <button id="scheme-dialog-cancel" class="btn btn-mini">取消</button>
      <button id="scheme-dialog-submit" class="btn btn-primary dialog-submit">保存</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add dialog and input CSS**

Append this to `renderer/style.css`:

```css
.text-input {
  width: 100%;
  background: #0f3460;
  border: 1px solid #2a2a4a;
  border-radius: 6px;
  color: #e0e0e0;
  padding: 8px 10px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.text-input:focus { border-color: #e94560; }

.field-label {
  display: block;
  margin: 12px 0 6px;
  font-size: 13px;
  color: #aaa;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}
.dialog-backdrop.hidden { display: none; }
.dialog {
  width: 100%;
  max-width: 360px;
  background: #16213e;
  border: 1px solid #2a2a4a;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.35);
}
.dialog h2 {
  font-size: 16px;
  margin-bottom: 10px;
  color: #e0e0e0;
}
.dialog-check {
  margin-top: 12px;
}
.dialog-actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}
.dialog-submit {
  width: auto;
  flex: 1.2;
  padding: 10px 14px;
  font-size: 14px;
}
```

- [ ] **Step 4: Verify DOM IDs are present by inspection**

Run:

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('renderer/index.html','utf8');for(const id of ['show-click-effect','scheme-dialog-backdrop','scheme-dialog-title','scheme-name-input','scheme-copy-row','scheme-copy-current','scheme-dialog-effect','scheme-dialog-cancel','scheme-dialog-submit']){if(!h.includes('id=\"'+id+'\"')){throw new Error('missing '+id)}}console.log('DOM OK')"
```

Expected output:

```text
DOM OK
```

---

### Task 4: Implement renderer dialog logic and include effect setting in form data

**Files:**
- Modify: `renderer/renderer.js`

**Interfaces:**
- Consumes DOM IDs from Task 3.
- Consumes preload APIs: `createScheme(name, fromCurrent)`, `renameScheme(id, name)`, `saveScheme()`, `updateSettings(settings)`.
- Produces: no browser `prompt` or `confirm` for new/rename flows.

- [ ] **Step 1: Add DOM references**

In `renderer/renderer.js`, after existing constants near the top, add:

```js
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
```

- [ ] **Step 2: Load the effect setting into the checkbox**

In `loadSettings()`, after:

```js
  useCenter.checked = !!s.useCenter;
```

add:

```js
  showClickEffect.checked = s.showClickEffect !== false;
```

- [ ] **Step 3: Disable the effect checkbox while running**

In `updateUI(running)`, after:

```js
  useCenter.disabled = running;
```

add:

```js
  showClickEffect.disabled = running;
```

- [ ] **Step 4: Include the effect setting in current form settings**

Change `getCurrentFormSettings()` from:

```js
function getCurrentFormSettings() {
  return {
    points: currentPoints.slice(),
    useCenter: useCenter.checked,
    intervalMs: parseInt(intervalInput.value) || 5000,
    displayIndex: parseInt(displaySelect.value) || 0,
  };
}
```

to:

```js
function getCurrentFormSettings() {
  return {
    points: currentPoints.slice(),
    useCenter: useCenter.checked,
    intervalMs: parseInt(intervalInput.value) || 5000,
    displayIndex: parseInt(displaySelect.value) || 0,
    showClickEffect: showClickEffect.checked,
  };
}
```

- [ ] **Step 5: Sync effect checkbox changes immediately**

After the `useCenter.addEventListener("change", ...)` block, add:

```js
showClickEffect.addEventListener("change", async () => {
  await window.electronAPI.updateSettings({ showClickEffect: showClickEffect.checked });
});
```

- [ ] **Step 6: Add dialog open/close helpers**

Before the `schemeNew.addEventListener("click", ...)` block, add:

```js
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
```

- [ ] **Step 7: Replace new-scheme browser prompt flow**

Replace the entire existing `schemeNew.addEventListener("click", async () => { ... });` block with:

```js
schemeNew.addEventListener("click", () => {
  openSchemeDialog("new");
});
```

- [ ] **Step 8: Replace rename browser prompt flow**

Replace the entire existing `schemeRename.addEventListener("click", async () => { ... });` block with:

```js
schemeRename.addEventListener("click", () => {
  openSchemeDialog("edit");
});
```

- [ ] **Step 9: Add dialog cancel, backdrop, keyboard behavior**

After the new and rename handlers, add:

```js
schemeDialogCancel.addEventListener("click", closeSchemeDialog);

schemeDialogBackdrop.addEventListener("click", (e) => {
  if (e.target === schemeDialogBackdrop) closeSchemeDialog();
});

schemeDialogBackdrop.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSchemeDialog();
  if (e.key === "Enter") schemeDialogSubmit.click();
});
```

- [ ] **Step 10: Add dialog submit behavior**

After the keyboard behavior from Step 9, add:

```js
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
```

- [ ] **Step 11: Remove old browser prompt/confirm only for new and rename**

Run:

```bash
node -e "const s=require('fs').readFileSync('renderer/renderer.js','utf8'); if(/schemeNew[\s\S]*prompt\(/.test(s)||/schemeRename[\s\S]*prompt\(/.test(s)) throw new Error('new/rename still use prompt'); console.log('DIALOG FLOW OK')"
```

Expected output:

```text
DIALOG FLOW OK
```

Note: The delete flow may still use `confirm("删除当前方案？该操作不可恢复。")`; this plan does not require a delete dialog.

- [ ] **Step 12: Run syntax check**

Run:

```bash
node -c renderer/renderer.js
```

Expected: no output and exit code 0.

---

### Task 5: Verify end-to-end behavior manually

**Files:**
- Read-only verification across app

**Interfaces:**
- Consumes all implementation from Tasks 1-4.
- Produces confidence that UI and main-process behavior match the design.

- [ ] **Step 1: Run all syntax checks**

Run:

```bash
node -c src/main/settings.js && node -c src/main/index.js && node -c src/main/clicker.js && node -c preload.js && node -c renderer/renderer.js
```

Expected: no output and exit code 0.

- [ ] **Step 2: Launch the app**

Run:

```bash
npm start
```

Expected: Electron window opens with:

- Scheme dropdown and Save/New/Rename/Delete buttons.
- A `显示鼠标点击特效` checkbox in the main form.
- No JavaScript errors in terminal output.

- [ ] **Step 3: Verify new scheme dialog**

In the app:

1. Click `新建`.
2. Confirm a custom modal opens with title `新建方案`.
3. Verify it has `方案名称`, `复制当前配置`, and `显示鼠标点击特效`.
4. Enter `测试方案`.
5. Uncheck `显示鼠标点击特效`.
6. Leave `复制当前配置` unchecked for a blank scheme.
7. Click `创建`.

Expected:

- Modal closes.
- Scheme dropdown selects `测试方案`.
- Main `显示鼠标点击特效` checkbox is unchecked.

- [ ] **Step 4: Verify rename/edit dialog**

In the app:

1. Click `重命名`.
2. Verify modal title is `编辑方案`.
3. Verify `复制当前配置` is hidden.
4. Rename to `测试方案改名`.
5. Check `显示鼠标点击特效`.
6. Click `保存`.

Expected:

- Modal closes.
- Dropdown shows `测试方案改名`.
- Main `显示鼠标点击特效` checkbox is checked.

- [ ] **Step 5: Verify persistence file contains the field**

Stop the app if needed, then run:

```bash
node -e "const fs=require('fs');const p='data/schemes.json';const data=JSON.parse(fs.readFileSync(p,'utf8'));const s=data.schemes.find(x=>x.name==='测试方案改名');if(!s) throw new Error('scheme missing'); if(typeof s.showClickEffect!=='boolean') throw new Error('showClickEffect missing'); console.log('PERSIST OK', s.showClickEffect)"
```

Expected output begins with:

```text
PERSIST OK
```

- [ ] **Step 6: Verify click effect toggle behavior**

In the app:

1. Select the edited scheme.
2. Uncheck `显示鼠标点击特效`.
3. Click `保存`.
4. Click `开始点击`.

Expected:

- Clicking starts.
- No ripple feedback window/effect appears.

Then:

1. Click `停止点击`.
2. Check `显示鼠标点击特效`.
3. Click `保存`.
4. Click `开始点击`.

Expected:

- Clicking starts.
- Ripple feedback effect appears at the clicked location.

- [ ] **Step 7: Commit implementation**

Run:

```bash
git add src/main/settings.js src/main/index.js renderer/index.html renderer/renderer.js renderer/style.css preload.js
git commit -m "feat: add scheme dialog and click effect toggle"
```

Expected: commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers the custom scheme dialog, save/new/rename improvements, the per-scheme click-effect switch, compatibility with old scheme data, and runtime feedback gating.
- Placeholder scan: No TBD/TODO/placeholder instructions remain. Each code change includes exact snippets and commands.
- Type consistency: The property name is consistently `showClickEffect` in settings, schemes, renderer form state, and main-process feedback gating.
