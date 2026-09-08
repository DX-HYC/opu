'use strict';
// Gitee 专用端到端测试：验证「更新模式」(原地更新、不新建分支) + CHANGELOG 追加。
// 结束后通过 API 删除测试仓库。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const publisher = require('../src/lib/publisher');
const cfg = require('../src/lib/config');
const gitee = require('../src/lib/gitee');

const REPO = 'opu-e2e-gitee';
const OWNER = 'hu_yu_chen';
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'opu-e2e-g-'));
const sh = (c) => execSync(c, { cwd: ROOT, stdio: 'ignore' });
const wf = (n, c) => fs.writeFileSync(path.join(ROOT, n), c, 'utf8');
const tok = cfg.readAll().tokens.gitee;

function assert(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); throw new Error(msg); }
  console.log('✓ ' + msg);
}
async function readRemoteChangelog() {
  const r = await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}/raw/CHANGELOG.md?access_token=${tok}`);
  if (!r.ok) return null;
  return r.text();
}
async function remoteBranches() {
  const r = await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}/branches?access_token=${tok}`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j || []).map((b) => b.name);
}
async function deleteRepo() {
  const r = await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}?access_token=${tok}`, { method: 'DELETE' });
  return r.ok;
}

(async () => {
  const onLog = (lv, msg) => console.log(`  [${lv}] ${msg}`);
  let cleaned = false;
  async function cleanup() {
    if (cleaned) return; cleaned = true;
    try { const ok = await deleteRepo(); console.log(ok ? '✓ Gitee 测试仓库已删除' : '⚠ Gitee 测试仓库删除失败'); }
    catch (e) { console.log('⚠ Gitee 测试仓库删除失败:', e.message); }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  process.on('SIGTERM', () => cleanup().finally(() => process.exit(process.exitCode || 1)));
  process.on('SIGINT', () => cleanup().finally(() => process.exit(process.exitCode || 1)));
  try {
    const m = {
      name: REPO, displayName: 'opu E2E Gitee', tagline: 'opu Gitee 端到端测试',
      description: 'e2e', license: 'MIT', visibility: 'public',
      features: ['功能 A'],
      platforms: { gitee: { owner: '', repo: REPO } },
    };
    wf('.opu.json', JSON.stringify(m, null, 2));
    wf('package.json', JSON.stringify({ name: REPO, version: '1.0.0' }, null, 2));
    wf('index.js', 'console.log("hello");\n');
    sh('git init -b master -q');
    sh('git config user.email e2e@e2e.e2e');
    sh('git config user.name e2e');

    console.log('\n===== Gitee 第 1 次发布（新建模式）=====');
    const r1 = await publisher.runPublish({ cwd: ROOT, platform: 'gitee', useAI: false, onLog });
    const t1 = r1.results.find((x) => x.target === 'gitee');
    assert(t1 && t1.ok && t1.created === true, 'Gitee 第 1 次为新建模式');
    const cl1 = await readRemoteChangelog();
    assert(cl1 && /## v1\.0\.0/.test(cl1), 'Gitee 远程 CHANGELOG 含 v1.0.0');

    console.log('\n===== Gitee 第 2 次发布（更新模式）=====');
    wf('index.js', 'console.log("hello v2");\n');
    wf('package.json', JSON.stringify({ name: REPO, version: '1.0.1' }, null, 2));
    const r2 = await publisher.runPublish({ cwd: ROOT, platform: 'gitee', useAI: false, onLog });
    const t2 = r2.results.find((x) => x.target === 'gitee');
    assert(t2 && t2.ok && t2.updated === true && t2.created === false, 'Gitee 第 2 次为更新模式（不新建仓库）');

    const br = await remoteBranches();
    assert(br.length === 1, `Gitee 远程分支未新增（仅 ${br.join(',')}）`);
    const cl2 = await readRemoteChangelog();
    assert(cl2 && /## v1\.0\.1/.test(cl2) && /## v1\.0\.0/.test(cl2), 'Gitee 远程 CHANGELOG 含两条条目');
    assert(cl2.indexOf('v1.0.1') < cl2.indexOf('v1.0.0'), 'Gitee CHANGELOG 新条目在旧条目之前（newest on top）');

    console.log('\nGitee 端到端用例全部通过 ✅');
  } catch (e) {
    console.error('\nGitee 端到端测试失败 ❌:', e.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    process.exit(process.exitCode || 0);
  }
})();
