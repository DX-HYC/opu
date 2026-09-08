'use strict';
// 端到端测试：新建 → 更新 发布周期，验证
//  1) 首次发布走「新建模式」（创建仓库）
//  2) 第二次发布检测到同一项目 → 「更新模式」（原地更新默认分支，不新建分支）
//  3) 每次发布都会把更新日志「追加」到 CHANGELOG.md（不覆盖历史）
// 测试结束后通过 API 删除两个测试仓库，不污染账号。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const publisher = require('../src/lib/publisher');
const manifest = require('../src/lib/manifest');
const github = require('../src/lib/github');
const gitee = require('../src/lib/gitee');
const cfg = require('../src/lib/config');

const REPO = 'opu-e2e-test';
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'opu-e2e-'));
const sh = (c) => execSync(c, { cwd: ROOT, stdio: 'ignore' });
const wf = (n, c) => fs.writeFileSync(path.join(ROOT, n), c, 'utf8');

const FH = {
  assert(cond, msg) {
    if (!cond) { console.error('❌ ' + msg); throw new Error(msg); }
    console.log('✓ ' + msg);
  },
};

function deleteRepo(target, owner, repo) {
  const tok = cfg.readAll().tokens[target];
  if (target === 'github') {
    return fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' },
    }).then((r) => r.status === 204 || r.status === 200);
  }
  return fetch(`https://gitee.com/api/v5/repos/${owner}/${repo}?access_token=${tok}`, {
    method: 'DELETE',
  }).then((r) => r.ok);
}

async function readRemoteChangelog(target, owner, repo) {
  const tok = cfg.readAll().tokens[target];
  if (target === 'github') {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/CHANGELOG.md`,
      { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return Buffer.from(j.content, 'base64').toString('utf8');
  }
  const r = await fetch(
    `https://gitee.com/api/v5/repos/${owner}/${repo}/raw/CHANGELOG.md?access_token=${tok}`
  );
  if (!r.ok) return null;
  return r.text();
}

async function remoteBranches(target, owner, repo) {
  const tok = cfg.readAll().tokens[target];
  if (target === 'github') {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' } }
    );
    if (!r.ok) return [];
    const j = await r.json();
    return (j || []).map((b) => b.name);
  }
  const r = await fetch(
    `https://gitee.com/api/v5/repos/${owner}/${repo}/branches?access_token=${tok}`
  );
  if (!r.ok) return [];
  const j = await r.json();
  return (j || []).map((b) => b.name);
}

(async () => {
  const onLog = (lv, msg) => console.log(`  [${lv}] ${msg}`);
  let cleaned = false;
  async function cleanup() {
    if (cleaned) return; cleaned = true;
    console.log('\n----- 清理测试仓库 -----');
    try { await deleteRepo('github', 'DX-HYC', REPO); console.log('✓ GitHub 测试仓库已删除/已尝试'); }
    catch (e) { console.log('⚠ GitHub 测试仓库删除失败（可手动删除）:', e.message); }
    try { await deleteRepo('gitee', 'hu_yu_chen', REPO); console.log('✓ Gitee 测试仓库已删除/已尝试'); }
    catch (e) { console.log('⚠ Gitee 测试仓库删除失败（可手动删除）:', e.message); }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  process.on('SIGTERM', () => cleanup().finally(() => process.exit(process.exitCode || 1)));
  process.on('SIGINT', () => cleanup().finally(() => process.exit(process.exitCode || 1)));
  try {    // ---- 准备临时项目 ----
    const m = {
      name: REPO,
      displayName: 'opu E2E Test',
      tagline: 'opu 端到端测试仓库（可删除）',
      description: 'e2e',
      license: 'MIT',
      visibility: 'public',
      features: ['测试功能 A', '测试功能 B'],
      platforms: {
        github: { owner: '', repo: REPO },
        gitee: { owner: '', repo: REPO },
      },
    };
    wf('.opu.json', JSON.stringify(m, null, 2));
    wf('package.json', JSON.stringify({ name: REPO, version: '1.0.0', description: 'e2e' }, null, 2));
    wf('index.js', 'console.log("hello v1");\n');
    sh('git init -b master -q');
    sh('git config user.email e2e@e2e.e2e');
    sh('git config user.name e2e');

    // ---- 第 1 次发布：应为「新建模式」----
    console.log('\n===== 第 1 次发布（期望：新建模式）=====');
    const r1 = await publisher.runPublish({ cwd: ROOT, platform: 'both', useAI: false, onLog });
    const g1 = r1.results.find((x) => x.target === 'github');
    const t1 = r1.results.find((x) => x.target === 'gitee');
    FH.assert(g1 && g1.ok && g1.created === true, 'GitHub 第 1 次为新建模式 (created=true)');
    FH.assert(t1 && t1.ok && t1.created === true, 'Gitee 第 1 次为新建模式 (created=true)');
    const ghOwner = 'DX-HYC';
    const gtOwner = 'hu_yu_chen';

    // 远程 CHANGELOG 应已存在且含本次条目
    const cl1g = await readRemoteChangelog('github', ghOwner, REPO);
    FH.assert(cl1g && /## v1\.0\.0/.test(cl1g), 'GitHub 远程 CHANGELOG 含 v1.0.0 条目');
    const cl1t = await readRemoteChangelog('gitee', gtOwner, REPO);
    FH.assert(cl1t && /## v1\.0\.0/.test(cl1t), 'Gitee 远程 CHANGELOG 含 v1.0.0 条目');

    // ---- 第 2 次发布：应检测到同一项目 → 更新模式 ----
    console.log('\n===== 第 2 次发布（期望：更新模式，不新建分支）=====');
    wf('index.js', 'console.log("hello v2 with new feature");\n');
    wf('package.json', JSON.stringify({ name: REPO, version: '1.0.1', description: 'e2e' }, null, 2));
    const r2 = await publisher.runPublish({ cwd: ROOT, platform: 'both', useAI: false, onLog });
    const g2 = r2.results.find((x) => x.target === 'github');
    const t2 = r2.results.find((x) => x.target === 'gitee');
    FH.assert(g2 && g2.ok && g2.updated === true && g2.created === false, 'GitHub 第 2 次为更新模式 (updated=true, created=false)');
    FH.assert(t2 && t2.ok && t2.updated === true && t2.created === false, 'Gitee 第 2 次为更新模式 (updated=true, created=false)');

    // 不新建分支：远程应只有 1 个分支（更新模式原地更新，不新建分支）
    const gb = await remoteBranches('github', ghOwner, REPO);
    FH.assert(gb.length === 1, `GitHub 远程分支未新增（仅 ${gb.join(',')}）`);
    const tb = await remoteBranches('gitee', gtOwner, REPO);
    FH.assert(tb.length === 1, `Gitee 远程分支未新增（仅 ${tb.join(',')}）`);

    // 远程 CHANGELOG 应有 2 条，且 v1.0.1 在 v1.0.0 之前（newest on top）
    const cl2g = await readRemoteChangelog('github', ghOwner, REPO);
    FH.assert(cl2g && /## v1\.0\.1/.test(cl2g) && /## v1\.0\.0/.test(cl2g), 'GitHub 远程 CHANGELOG 含两条条目');
    if (cl2g) {
      FH.assert(cl2g.indexOf('v1.0.1') < cl2g.indexOf('v1.0.0'), 'GitHub CHANGELOG 新条目在旧条目之前');
    }
    const cl2t = await readRemoteChangelog('gitee', gtOwner, REPO);
    FH.assert(cl2t && /## v1\.0\.1/.test(cl2t) && /## v1\.0\.0/.test(cl2t), 'Gitee 远程 CHANGELOG 含两条条目');

    console.log('\n全部端到端用例通过 ✅');
  } catch (e) {
    console.error('\n端到端测试失败 ❌:', e.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    process.exit(process.exitCode || 0);
  }
})();
