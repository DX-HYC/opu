'use strict';

/**
 * opu config — 全局配置管理
 * 用法：
 *   opu config get <key>
 *   opu config set <key> <value>
 *   opu config list
 *   opu config path
 */

const ui = require('../lib/ui');
const cfg = require('../lib/config');

module.exports = async function ({ program }) {
  const cmd = program
    .command('config')
    .description('管理全局配置（~/.opu/config.json）');

  cmd
    .command('list')
    .alias('ls')
    .description('查看完整配置（token 会脱敏）')
    .action(() => {
      const all = cfg.readAll();
      const redacted = JSON.parse(JSON.stringify(all));
      if (redacted.tokens?.github) redacted.tokens.github = mask(redacted.tokens.github);
      if (redacted.tokens?.gitee) redacted.tokens.gitee = mask(redacted.tokens.gitee);
      if (redacted.ai?.apiKey) redacted.ai.apiKey = mask(redacted.ai.apiKey);
      console.log(JSON.stringify(redacted, null, 2));
    });

  cmd
    .command('get <key>')
    .description('读取单个 key（点路径，如 tokens.github）')
    .action((key) => {
      const v = cfg.get(key);
      console.log(v === undefined ? '(unset)' : (typeof v === 'object' ? JSON.stringify(v, null, 2) : v));
    });

  cmd
    .command('set <key> <value>')
    .description('设置单个 key')
    .action((key, value) => {
      cfg.set(key, value);
      console.log(ui.ok(`已设置 ${key}`));
    });

  cmd
    .command('unset <key>')
    .description('重置某个 key 为空')
    .action((key) => {
      cfg.set(key, '');
      console.log(ui.ok(`已清空 ${key}`));
    });

  cmd
    .command('path')
    .description('打印配置文件路径')
    .action(() => {
      console.log(cfg.path());
    });
};

function mask(s) {
  if (!s) return '';
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '****' + s.slice(-4);
}
