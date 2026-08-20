// 共享帮助函数：认证、GitHub API、Release/上传逻辑
// 被 scripts/release.js（打包+上传）和 scripts/upload.js（仅上传）共同 require
const { spawn, execSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync, renameSync } = require('fs');
const { join, resolve, basename } = require('path');
const readline = require('readline');

const ROOT = resolve(__dirname, '..');
const TOKEN_FILE = join(ROOT, '.release-token');

function ask(question, defaultVal) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = defaultVal !== undefined && defaultVal !== '' ? ` (${defaultVal})` : '';
    rl.question(`${question}${suffix}: `, (ans) => {
      rl.close();
      res(ans.trim() || defaultVal);
    });
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} 退出码 ${code}`))));
  });
}

function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, 'utf8').trim();
  return null;
}

// 获取 token，不存在则交互询问并保存。返回最终 token（或 null 表示放弃）
async function ensureToken() {
  let token = getToken();
  if (token) return token;

  console.log('\n未找到 GitHub Token（环境变量 GH_TOKEN/GITHUB_TOKEN 或 ' + TOKEN_FILE + '）。');
  console.log('前往 https://github.com/settings/tokens 新建一个勾选 `repo` 权限的 token。\n');
  token = await ask('请输入 GitHub Token', '');
  if (!token) return null;
  try {
    writeFileSync(TOKEN_FILE, token.trim() + '\n', { mode: 0o600 });
    console.log('已保存到 .release-token（已在 .gitignore 中忽略，不会提交）。\n');
  } catch (e) {
    console.warn('保存 token 失败（但不影响本次使用）：' + e.message);
  }
  return token.trim();
}

function parseRemote() {
  try {
    const out = execSync('git remote get-url origin', { cwd: ROOT }).toString().trim();
    // 支持 https://github.com/owner/repo.git 和 git@github.com:owner/repo.git
    const m = out.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (m) return { owner: m[1], repo: m[2] };
  } catch {}
  return null;
}

// 返回 YYYYMMDD 日期串
function buildDate(d) {
  const dt = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}`;
}

function productName() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return (pkg.build && pkg.build.productName) || 'AutoClicker';
  } catch {}
  return 'AutoClicker';
}

// 列出 dist/ 下所有 .exe，排除 latest.yml/blockmap
function listExes(distDir) {
  return readdirSync(distDir)
    .filter((f) => /\.exe$/i.test(f))
    .map((f) => join(distDir, f));
}

// 统一认证头。用 `token` scheme（PAT ghp_ 与 gh OAuth gho_/ghu_ 都能用，Bearer 只认 ghp_）
function authHeaders(token) {
  return {
    Authorization: 'token ' + token,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'autoclicker-release',
  };
}

// 查找或创建指定 tag 的 Release，返回 upload_url
async function findOrCreateRelease(token, owner, repo, tag, notes) {
  const enc = encodeURIComponent;
  const repoFull = `${enc(owner)}/${enc(repo)}`;
  const log = (m) => console.log('[release] ' + m);

  const getRel = await fetch(`https://api.github.com/repos/${repoFull}/releases/tags/${enc(tag)}`, {
    headers: authHeaders(token),
  });

  if (getRel.ok) {
    const rel = await getRel.json();
    log(`已存在 tag ${tag}，复用原 Release。`);
    return rel.upload_url;
  }
  if (getRel.status === 404) {
    const create = await fetch(`https://api.github.com/repos/${repoFull}/releases`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: tag, body: notes, draft: false, prerelease: false }),
    });
    if (!create.ok) {
      console.error('创建 Release 失败：', create.status, await create.text());
      process.exit(1);
    }
    const rel = await create.json();
    log(`已创建 Release ${tag}。`);
    return rel.upload_url;
  }
  console.error('查询 Release 失败：', getRel.status, await getRel.text());
  process.exit(1);
}

// 上传文件列表到指定 Release。同名 asset 已存在则先删除再传。
async function uploadFiles(token, uploadUrl, files) {
  const log = (m) => console.log('[release] ' + m);
  for (const file of files) {
    const name = basename(file);
    const mb = (statSync(file).size / 1024 / 1024).toFixed(1);
    log(`上传 ${name} (${mb} MB) ...`);

    // 先查该 Release 是否已有同名 asset，有则删除（避免 422）
    const listUrl = uploadUrl.replace('{?name,label}', '');
    const listResp = await fetch(`${listUrl}?per_page=100`, { headers: authHeaders(token) });
    if (listResp.ok) {
      const assets = await listResp.json();
      const dup = assets.find((a) => a.name === name);
      if (dup) {
        log(`  → 检测到同名 asset，删除旧版 …`);
        await fetch(dup.url, { method: 'DELETE', headers: authHeaders(token) });
      }
    }

    const url = listUrl + '?name=' + encodeURIComponent(name);
    const buf = readFileSync(file);
    const up = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/octet-stream' },
      body: buf,
    });
    if (up.ok) {
      log('  完成 ✓');
    } else {
      console.error(`  失败：${up.status} ${await up.text()}`);
    }
  }
}

module.exports = {
  ROOT,
  TOKEN_FILE,
  ask,
  run,
  getToken,
  ensureToken,
  parseRemote,
  buildDate,
  productName,
  listExes,
  findOrCreateRelease,
  uploadFiles,
};