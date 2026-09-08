'use strict';

/**
 * opu doctor — 环境与配置健康检查
 *  - git 可用性 / 当前目录 git 状态
 *  - GitHub / Gitee token（whoami 测通）
 *  - AI 配置（不消耗 token，仅 ping 一次）
 *  - WorkBuddy 索引可达性
 */

const path = require('path');
const ui = require('../lib/ui');
const config = require('../lib/config');
const git = require('../lib/git');
const github = require('../lib/github');
const gitee = require('../lib/gitee');
const workbuddy = require('../lib/workbuddy');
const ai = require('../lib/ai');

module.exports = async function doctor({ program, pkg: _pkg }) {
  program
    .command('doctor [dir]')
    .description('检查 opu 运行环境（git、tokens、AI、WorkBuddy 索引等）')
    .action(async (dir) => {
      const cwd = path.resolve(dir || process.cwd());
      console.log(ui.header('opu doctor — 环境检查'));
      const summary = [];

      // 1) Git
      const gitOk = await git.isGitAvailable();
      summary.push({ name: 'Git', detail: gitOk ? 'available' : '未检测到 git 命令', ok: gitOk });
      if (gitOk) {
        const s = await git.status(cwd);
        summary.push({
          name: 'Git 仓库',
          detail: s.isRepo ? `branch=${s.branch}, clean=${s.isClean}` : '当前目录不是 git 仓库（opu publish 时会自动 init）',
          ok: s.isRepo,
        });
      }

      // 2) GitHub token
      const cfg = config.readAll();
      if (cfg.tokens.github) {
        try {
          const me = await github.whoami(cfg.tokens.github);
          summary.push({ name: 'GitHub Token', detail: `已认证：${me.login}`, ok: true });
        } catch (err) {
          summary.push({ name: 'GitHub Token', detail: `认证失败：${err.message}`, ok: false });
        }
      } else {
        summary.push({ name: 'GitHub Token', detail: '未配置（运行 opu config set tokens.github=xxx）', ok: false });
      }

      // 3) Gitee token
      if (cfg.tokens.gitee) {
        try {
          const me = await gitee.whoami(cfg.tokens.gitee);
          summary.push({ name: 'Gitee Token', detail: `已认证：${me.login}`, ok: true });
        } catch (err) {
          summary.push({ name: 'Gitee Token', detail: `认证失败：${err.message}`, ok: false });
        }
      } else {
        summary.push({ name: 'Gitee Token', detail: '未配置（运行 opu config set tokens.gitee=xxx）', ok: false });
      }

      // 4) AI
      if (cfg.ai?.apiKey) {
        summary.push({ name: 'AI (DeepSeek)', detail: `${cfg.ai.provider} @ ${cfg.ai.baseUrl}, model=${cfg.ai.model}`, ok: true });
      } else {
        summary.push({ name: 'AI (DeepSeek)', detail: '未配置 AI Key（运行 opu config set ai.apiKey=xxx，或用 --no-ai 跳过 AI）', ok: false });
      }

      // 5) WorkBuddy 索引
      const wbHits = [];
      for (const r of workbuddy.CANDIDATE_INDEX_ROOTS) {
        if (require('fs').existsSync(r)) wbHits.push(r);
      }
      summary.push({
        name: 'WorkBuddy 索引',
        detail: wbHits.length ? `发现 ${wbHits.length} 个候选索引目录` : '未发现索引（也不影响使用）',
        ok: wbHits.length > 0,
      });

      console.log(ui.table(summary.map((r) => ({ 检查项: r.name, 状态: r.ok ? '✔' : '✖', 详情: r.detail }))));

      const allOk = summary.filter((r) => r.name !== 'WorkBuddy 索引').every((r) => r.ok);
      console.log('');
      if (allOk) console.log(ui.ok('全部核心检查通过，可以执行 opu publish'));
      else console.log(ui.warn('存在未通过的项，发布前请先修复'));
    });
};
