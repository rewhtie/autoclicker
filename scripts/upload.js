// 仅上传 dist/ 下已有的安装包到 GitHub Releases（不重新打包）
// 用法: npm run upload
// 打包+上传的完整流程见 scripts/release.js（npm run release）
const { join, basename } = require('path');
const {
  ROOT, buildDate, productName, ask, ensureToken, parseRemote,
  listExes, findOrCreateRelease, uploadFiles,
} = require('./_shared');

(async () => {
  const distDir = join(ROOT, 'dist');
  const exes = listExes(distDir);
  if (exes.length === 0) {
    console.error('dist/ 下没有 .exe 安装包。请先运行 npm run release 打包，或手动放入安装包。');
    process.exit(1);
  }

  console.log('以下安装包将上传：');
  exes.forEach((f) => console.log('  - ' + f));
  console.log('');

  // 用当天日期作为默认 tag；若当天已经传过想重传，会自动复用/覆盖同名 asset
  const date = buildDate();
  const tag = await ask('Release 版本号 (tag，默认当天日期)', date);
  const notes = await ask('发布说明', `${productName()} ${date}`);

  const token = await ensureToken();
  if (!token) {
    console.error('未提供 Token，退出。');
    process.exit(1);
  }

  const remote = parseRemote() || { owner: 'rewhtie', repo: 'autoclicker' };

  console.log(`\n==> 创建/查找 Release（tag = ${tag}）\n`);
  const uploadUrl = await findOrCreateRelease(token, remote.owner, remote.repo, tag, notes);

  console.log('\n==> 上传安装包\n');
  await uploadFiles(token, uploadUrl, exes);

  console.log(`\n完成！https://github.com/${remote.owner}/${remote.repo}/releases/tag/${tag}`);
})().catch((e) => {
  console.error('\n出错：', e.message);
  process.exit(1);
});