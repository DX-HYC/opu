'use strict';
// 临时单测：验证 changelog 模块的「追加而非覆盖」与「改动检测」
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const changelog = require('../src/lib/changelog');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-test-'));
function sh(cmd) { execSync(cmd, { cwd: TMP, stdio: 'ignore' }); }
function wf(name, content) { fs.writeFileSync(path.join(TMP, name), content, 'utf8'); }

// 初始化 git 仓库 + 初始提交
sh('git init -q');
sh('git config user.email t@t.t');
sh('git config user.name t');
wf('manifest.json', JSON.stringify({ name: 'demo', version: '1.0.0' }));
wf('app.js', 'console.log(1);\n');
sh('git add -A');
sh('git commit -qm "init"');

function assert(cond, msg) { if (!cond) { console.error('❌ ' + msg); process.exit(1); } else console.log('✓ ' + msg); }

// ---- 模拟「首次发布」：lastPublished 不存在 → forceInitial ----
const head1 = execSync('git rev-parse HEAD', { cwd: TMP }).toString().trim();
let summary = changelog.computeChangeSummary(TMP, null); // 无基线
assert(summary.commits.length >= 1, '无基线时仍能拿到提交记录');

let entry = changelog.buildEntry({ version: '1.0.0', date: '2026-09-07', body: '- 初始版本发布' });
let appended = changelog.appendChangelog(TMP, entry);
assert(appended === true, '首次追加写入成功');
let cl = changelog.readChangelog(TMP);
assert(cl.includes('## v1.0.0 - 2026-09-07'), '包含 v1.0.0 标题');
assert(cl.startsWith('# CHANGELOG'), '以标题开头');

// 重复追加相同条目应被跳过
appended = changelog.appendChangelog(TMP, entry);
assert(appended === false, '相同条目去重跳过');

// ---- 模拟「第二次更新」：有上次发布的 sha 作为基线 ----
wf('app.js', 'console.log(2);\n');
wf('readme.txt', 'hello\n');
sh('git add -A');
sh('git commit -qm "fix: 修正计数逻辑"');
const head2 = execSync('git rev-parse HEAD', { cwd: TMP }).toString().trim();

summary = changelog.computeChangeSummary(TMP, head1); // 基线 = 上次发布
assert(summary.commits.some((c) => c.includes('修正计数逻辑')), '能检测到新提交');
assert(summary.files.includes('app.js'), '能检测到改动文件');
assert(summary.files.includes('readme.txt'), '能检测到新增文件');
assert(!summary.files.includes('CHANGELOG.md'), '自动生成的 CHANGELOG 不计入改动');

entry = changelog.buildEntry({ version: '1.0.1', date: '2026-09-08', body: summary.commits.map((c) => `- ${c.replace(/^[0-9a-f]+\s+/i, '')}`).join('\n') });
changelog.appendChangelog(TMP, entry);
cl = changelog.readChangelog(TMP);
// 最新条目应在最上方（标题之后、旧条目之前）
const idxNew = cl.indexOf('## v1.0.1 - 2026-09-08');
const idxOld = cl.indexOf('## v1.0.0 - 2026-09-07');
assert(idxNew !== -1 && idxOld !== -1, '两次条目都在');
assert(idxNew < idxOld, '新条目在旧条目之前（newest on top）');

console.log('\n全部通过 ✅');
process.exit(0);
