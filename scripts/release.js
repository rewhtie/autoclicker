// 打包 + 询问是否上传到 GitHub Releases（打包日期作为 tag，不再用版本号）
// 用法: npm run release
// 只上传、不打包的独立指令见 scripts/upload.js（npm run upload）
const { join } = require('path');
const {
  ROOT, buildDate, productName, run, ask, ensureToken, parseRemote,
  listExes, findOrCreateRelease, uploadFiles,
} = require('./_shared');

(async () => {
  const date = buildDate();
  // 供 electron-builder 的 artifactName 宏 ${env.BUILD_DATE} 使用，文件名带日期
  process.env.BUILD_DATE = date;

  // 国内镜像：避免从 GitHub 下载 electron 二进制超时
  process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';

  console.log(`==> 步骤 1/3：打包（日期标记 ${date}）\n`);
  await run('npm', ['run', 'dist:win'], { cwd: ROOT });

  const distDir = join(ROOT, 'dist');
  const exes = listExes(distDir);
  if (exes.length === 0) {
    console.error('\n未在 dist/ 找到 .exe 安装包，请检查打包是否成功。');
    process.exit(1);
  }
  console.log('\n打包产物：');
  exes.forEach((f) => console.log('  - ' + f));
  console.log('');

  const doUpload = await ask('是否上传到 GitHub Releases？', 'y');
  if (!/^y/i.test(doUpload)) {
    console.log('已跳过上传。');
    return;
  }

  const token = await ensureToken();
  if (!token) {
    console.error('未提供 Token，退出。');
    process.exit(1);
  }

  const remote = parseRemote() || { owner: 'rewhtie', repo: 'autoclicker' };
  const tag = date; // 用打包日期作为 release tag，不再用版本号
  const notes = await ask('发布说明', `${productName()} ${date}`);

  console.log(`\n==> 步骤 2/3：创建/查找 Release（tag = ${tag}）\n`);
  const uploadUrl = await findOrCreateRelease(token, remote.owner, remote.repo, tag, notes);

  console.log('\n==> 步骤 3/3：上传安装包\n');
  await uploadFiles(token, uploadUrl, exes);

  console.log(`\n完成！https://github.com/${remote.owner}/${remote.repo}/releases/tag/${tag}`);
})().catch((e) => {
  console.error('\n出错：', e.message);
  process.exit(1);
});