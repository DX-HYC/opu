'use strict';

/**
 * opu sync — 在 GitHub 和 Gitee 间同步仓库镜像
 *
 * 用法：
 *   opu sync <owner>/<repo>            默认从 github 推到 gitee
 *   opu sync <owner>/<repo> --from gitee --to github
 *   opu sync <owner>/<repo> --both     双向对比增量同步
 */

const path = require('path');
const ui = require('../lib/ui');
const cfg = require('../lib/config');
const github = require('../lib/github');
const gitee = require('../lib/gitee');

module.exports = async function ({ program }) {
  program
    .command('sync <repo>')
    .description('在 GitHub 与 Gitee 之间同步仓库（默认 github → gitee）')
    .option('--from <platform>', '源平台 (github | gitee)', 'github')
    .option('--to <platform>', '目标平台 (github | gitee)', 'gitee')
    .option('--both', '双向同步', false)
    .action(async (repo, opts) => {
      const config_ = cfg.readAll();
      const [owner, name] = repo.split('/');
      if (!owner || !name) {
        console.log(ui.err('repo 格式必须是 <owner>/<repo>'));
        process.exit(1);
      }
      if (opts.both) {
        await syncOnce({ from: 'github', to: 'gitee', config: config_, owner, repo: name });
        await syncOnce({ from: 'gitee', to: 'github', config: config_, owner, repo: name });
      } else {
        await syncOnce({ from: opts.from, to: opts.to, config: config_, owner, repo: name });
      }
    });
};

async function syncOnce({ from, to, config, owner, repo }) {
  console.log(ui.header(`opu sync: ${from} → ${to}`));
  const srcApi = from === 'github' ? github : gitee;
  const dstApi = to === 'github' ? github : gitee;
  const srcToken = from === 'github' ? config.tokens.github : config.tokens.gitee;
  const dstToken = to === 'github' ? config.tokens.github : config.tokens.gitee;

  if (!srcToken || !dstToken) {
    console.log(ui.err(`需要同时配置 ${from} 和 ${to} 的 token`));
    return;
  }

  // 源仓库元数据
  let meta;
  try {
    meta = await srcApi.repoExists(srcToken, owner, repo);
  } catch (err) {
    console.log(ui.err(`读取源仓库失败：${err.message}`));
    return;
  }
  if (!meta) {
    console.log(ui.err(`源仓库不存在：${from}/${owner}/${repo}`));
    return;
  }
  console.log(ui.info(`源：${meta.html_url || meta.url}`));

  // 目标仓库
  let dstMeta;
  try {
    dstMeta = await dstApi.repoExists(dstToken, owner, repo);
  } catch (err) {
    console.log(ui.err(`读取目标仓库失败：${err.message}`));
    return;
  }
  if (!dstMeta) {
    console.log(ui.info(`目标仓库不存在，正在创建…`));
    try {
      dstMeta = await dstApi.createRepo(dstToken, {
        repo,
        description: meta.description || '',
        visibility: meta.private ? 'private' : 'public',
      });
    } catch (err) {
      console.log(ui.err(`创建目标仓库失败：${err.message}`));
      return;
    }
  }
  console.log(ui.info(`目标：${dstMeta.html_url || dstMeta.url}`));

  // 通过本地 git 把源 push 到目标（mirror）
  const tmp = path.join(require('os').tmpdir(), `opu-sync-${owner}-${repo}-${Date.now()}`);
  require('fs').mkdirSync(tmp, { recursive: true });
  const { spawnSync } = require('child_process');
  const srcUrl = from === 'github'
    ? `https://x-access-token:${srcToken}@github.com/${owner}/${repo}.git`
    : `https://${srcToken}@gitee.com/${owner}/${repo}.git`;
  const dstUrl = to === 'github'
    ? `https://x-access-token:${dstToken}@github.com/${owner}/${repo}.git`
    : `https://${dstToken}@gitee.com/${owner}/${repo}.git`;

  const run = (cmd, args, opts2 = {}) => {
    const r = spawnSync(cmd, args, { cwd: tmp, stdio: 'inherit', ...opts2 });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
  };

  try {
    run('git', ['clone', '--mirror', srcUrl, tmp]);
    run('git', ['remote', 'set-url', 'origin', dstUrl]);
    run('git', ['push', '--mirror']);
    console.log(ui.ok(`同步完成：${from} → ${to}`));
  } catch (err) {
    console.log(ui.err(`同步失败：${err.message}`));
  } finally {
    try { require('fs').rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}
