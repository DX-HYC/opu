'use strict';

/**
 * opu publish — 一键发布主流程（CLI 适配层）
 *
 * 交互式确认 + 调用 src/lib/publisher.js 的核心逻辑。
 * 核心发布逻辑已抽取到 publisher.js，CLI / GUI 共用，避免重复。
 */

const path = require('path');
const ui = require('../lib/ui');
const manifest = require('../lib/manifest');
const git = require('../lib/git');
const publisher = require('../lib/publisher');

module.exports = async function publish({ program, pkg: _pkg }) {
  program
    .command('publish [dir]')
    .description('一键发布到 GitHub + Gitee')
    .option('--platform <name>', '只发布到指定平台（github / gitee / both）', 'both')
    .option('--message <msg>', 'git commit message', 'chore: publish via opu')
    .option('--yes', '跳过交互确认', false)
    .option('--no-ai', '不使用 AI，直接使用 manifest.docs 中已存在的 README/教程')
    .option('--dry-run', '只演练，不实际推送 / 创建仓库', false)
    .action(async (dir, opts) => {
      const cwd = path.resolve(dir || process.cwd());
      console.log(ui.header('opu publish — 一键发布'));

      // 1) 加载 manifest
      if (!manifest.exists(cwd)) {
        console.log(ui.err(`未找到 ${manifest.FILENAME}，请先执行 opu init`));
        process.exit(2);
      }
      let m = manifest.read(cwd);
      m = manifest.fillDefaults(m, {});

      // 2) git 健康 & 干净度确认
      const gitAvail = await git.isGitAvailable();
      if (!gitAvail) {
        console.log(ui.err('系统未安装 git 或不在 PATH 中'));
        process.exit(3);
      }
      const sCheck = await git.status(cwd);
      if (!sCheck.isClean && !opts.yes) {
        console.log(ui.warn('当前工作区非空。'));
        console.log(ui.dim(`  modified: ${sCheck.modified.length}, untracked: ${sCheck.untracked.length}`));
        const cont = await require('inquirer').prompt([{
          type: 'confirm', name: 'ok', message: '继续提交并发布？', default: true,
        }]);
        if (!cont.ok) {
          console.log(ui.warn('已取消'));
          return;
        }
      }

      // 把 UI 日志接到 publisher 的 onLog 回调
      const onLog = (level, msg) => {
        const fn = {
          info: ui.info, ok: ui.ok, warn: ui.warn, err: ui.err, dim: ui.dim,
        }[level] || ui.info;
        console.log(fn(msg));
      };

      try {
        const res = await publisher.runPublish({
          cwd,
          platform: opts.platform,
          dryRun: opts.dryRun,
          useAI: opts.ai,
          message: opts.message,
          onLog,
        });
        console.log('');
        console.log(ui.header('发布结果'));
        for (const r of res.results) {
          if (r.ok) console.log(ui.ok(`[${r.target}] ${r.url || '(已存在/无变更)'}`));
          else console.log(ui.err(`[${r.target}] ${r.error}`));
        }
      } catch (err) {
        console.log(ui.err(err.message));
        if (process.env.OPU_DEBUG) console.error(err.stack);
        process.exit(1);
      }
    });
};
