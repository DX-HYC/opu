'use strict';

/**
 * 冒烟测试：加载 opu 入口、确认 CLI 可正常注册且各子命令至少能 require 通过
 */

const path = require('path');
const fs = require('fs');

function assert(cond, msg) {
  if (!cond) {
    console.error('✖ ' + msg);
    process.exit(1);
  }
  console.log('✔ ' + msg);
}

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
assert(pkg.name === 'opu', 'package.json name = opu');

const modules = [
  'src/lib/scanner.js',
  'src/lib/config.js',
  'src/lib/manifest.js',
  'src/lib/ui.js',
  'src/lib/git.js',
  'src/lib/github.js',
  'src/lib/gitee.js',
  'src/lib/ai.js',
  'src/lib/workbuddy.js',
  'src/lib/templates.js',
  'src/commands/init.js',
  'src/commands/doctor.js',
  'src/commands/config.js',
  'src/commands/publish.js',
  'src/commands/sync.js',
  'src/commands/license_texts.js',
];
for (const m of modules) {
  const full = path.join(root, m);
  assert(fs.existsSync(full), `文件存在：${m}`);
  delete require.cache[require.resolve(full)];
  // eslint-disable-next-line global-require
  require(full);
}
assert(true, `已成功 require 全部 ${modules.length} 个模块`);

// 测试 manifest.empty
const manifest = require(path.join(root, 'src/lib/manifest.js'));
const e = manifest.empty('demo', process.cwd());
assert(e.name === 'demo', 'manifest.empty 设置 name');
assert(Array.isArray(e.features), 'manifest.empty features 是数组');

// 测试 scanner：本地仓库自身可扫
const scanner = require(path.join(root, 'src/lib/scanner.js'));
scanner.scan(root).then((r) => {
  assert(Array.isArray(r.techStack), 'scanner 返回 techStack 数组');
  assert(r.sourceSamples.length > 0, 'scanner 拿到源码样本');
  console.log('\n冒烟测试通过');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
