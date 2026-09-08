'use strict';

/**
 * Git 操作封装
 *
 * 关键能力：
 *  - 检查 git 可用性
 *  - 初始化 / 读取 .git
 *  - 检查 working tree 是否干净
 *  - 提交 + 推送
 *  - 添加 remote
 */

const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

async function isGitAvailable() {
  return new Promise((resolve) => {
    const p = spawn('git', ['--version']);
    let stdout = '';
    p.stdout.on('data', (d) => { stdout += d.toString(); });
    p.on('close', (code) => resolve(code === 0 && /git version/i.test(stdout)));
    p.on('error', () => resolve(false));
  });
}

function ensureRepo(rootDir) {
  const gitDir = path.join(rootDir, '.git');
  if (!fs.existsSync(gitDir)) {
    return null;
  }
  return simpleGit({ baseDir: rootDir });
}

async function status(rootDir) {
  const git = ensureRepo(rootDir);
  if (!git) return { isRepo: false };
  const s = await git.status();
  return {
    isRepo: true,
    branch: s.current,
    isClean: s.isClean(),
    ahead: s.ahead,
    behind: s.behind,
    modified: s.modified,
    staged: s.staged,
    untracked: s.not_added,
  };
}

async function initRepo(rootDir) {
  const git = simpleGit(rootDir);
  await git.init();
  return simpleGit({ baseDir: rootDir });
}

async function addRemote(rootDir, name, url) {
  const git = ensureRepo(rootDir);
  if (!git) throw new Error('当前目录不是 git 仓库');
  const remotes = await git.getRemotes();
  const existing = remotes.find((r) => r.name === name);
  if (existing) {
    await git.removeRemote(name);
  }
  await git.addRemote(name, url);
}

async function commitAll(rootDir, message) {
  const git = ensureRepo(rootDir);
  if (!git) throw new Error('当前目录不是 git 仓库');
  await git.add('.');
  const s = await git.status();
  if (s.isClean()) {
    return { committed: false, reason: 'working tree is clean' };
  }
  await git.commit(message);
  return { committed: true };
}

async function push(rootDir, remote, branch) {
  const git = ensureRepo(rootDir);
  if (!git) throw new Error('当前目录不是 git 仓库');
  const branchName = branch || (await git.status()).current || 'main';
  const res = await git.push(remote, branchName, ['--set-upstream']);
  return res;
}

async function pushAuth(rootDir, url, branch) {
  const git = ensureRepo(rootDir);
  if (!git) throw new Error('当前目录不是 git 仓库');
  const branchName = branch || (await git.status()).current || 'main';
  // url 中已内联 token，不会持久化到 .git/config
  // 设置 GIT_HTTP_TIMEOUT 避免异常网络下 git push 永久挂起（超时后由上层降级为 API 上传）
  await git.env({ GIT_HTTP_TIMEOUT: process.env.GIT_HTTP_TIMEOUT || '30' }).push(url, branchName);
  return branchName;
}

async function setUpstream(rootDir, remote, branch) {
  const git = ensureRepo(rootDir);
  if (!git) return;
  try {
    await git.branch(['--set-upstream-to', `${remote}/${branch}`]);
  } catch (_) { /* 非关键：失败不影响已完成的推送 */ }
}

// 若仓库（含全局）未配置 user.name/user.email，写一条项目级（local）身份，
// 避免 git commit 因缺身份失败；不污染全局 git 配置。
async function ensureIdentity(rootDir, fallback) {
  const git = ensureRepo(rootDir);
  if (!git) return;
  let hasName = false, hasEmail = false;
  try { const v = await git.raw(['config', 'user.name']); hasName = !!v && v.trim().length > 0; } catch (_) {}
  try { const v = await git.raw(['config', 'user.email']); hasEmail = !!v && v.trim().length > 0; } catch (_) {}
  if (!hasName) {
    await git.addConfig('user.name', (fallback && fallback.name) || 'opu-publisher', 'local');
  }
  if (!hasEmail) {
    await git.addConfig('user.email', (fallback && fallback.email) || 'publisher@opu.local', 'local');
  }
}

async function currentBranch(rootDir) {
  const git = ensureRepo(rootDir);
  if (!git) return null;
  const s = await git.status();
  return s.current;
}

// 返回某 ref 的 commit sha（如 HEAD）。非仓库 / 不存在则返回 null。
async function revParse(rootDir, ref) {
  const git = ensureRepo(rootDir);
  if (!git) return null;
  try {
    const out = await git.raw(['rev-parse', ref]);
    return (out || '').trim() || null;
  } catch (_) { return null; }
}

// 自某基线（sha）以来的提交记录（oneline）。ref 为空时返回 HEAD 单条。
// 注：基于同步 spawnSync，故为非 async 函数，直接返回数组（调用方无需 await）。
function commitMessagesSince(rootDir, fromRef) {
  if (!fs.existsSync(path.join(rootDir, '.git'))) return [];
  const range = fromRef ? `${fromRef}..HEAD` : 'HEAD';
  return gitLines(rootDir, ['log', '--oneline', range]);
}

// 自某基线以来的改动文件（工作树 vs 基线）。ref 为空时对比 HEAD。
// 注：基于同步 spawnSync，故为非 async 函数，直接返回数组（调用方无需 await）。
function changedFilesSince(rootDir, fromRef) {
  if (!fs.existsSync(path.join(rootDir, '.git'))) return [];
  const ref = fromRef || 'HEAD';
  return gitLines(rootDir, ['diff', '--name-only', ref]);
}

// 同步执行 git 命令并返回非空行数组（避免 simple-git raw 在传数组参数时的歧义）
function gitLines(cwd, args) {
  let res;
  try {
    res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  } catch (_) { return []; }
  if (!res || res.status !== 0) return [];
  return (res.stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// 推送指定 refspec（如 HEAD:refs/heads/master），extraArgs 可传 ['--force-with-lease']。
// url 内联 token，不持久化到 .git/config。
async function pushRefspec(rootDir, url, refspec, extraArgs = []) {
  const git = ensureRepo(rootDir);
  if (!git) throw new Error('当前目录不是 git 仓库');
  // GIT_SSL_BACKEND=openssl 规避 Windows schannel 在部分环境下
  // 「server closed abruptly (missing close_notify)」的 TLS 握手失败。
  await git
    .env({
      GIT_HTTP_TIMEOUT: process.env.GIT_HTTP_TIMEOUT || '30',
      GIT_SSL_BACKEND: 'openssl',
    })
    .push(url, refspec, extraArgs);
}

async function rawAdd(rootDir, pathspec = '.') {
  const git = ensureRepo(rootDir);
  if (!git) return;
  await git.raw(['add', pathspec]);
}

async function rawCommit(rootDir, ...args) {
  const git = ensureRepo(rootDir);
  if (!git) return;
  await git.raw(['commit', ...args]);
}

async function setConfig(rootDir, key, value, scope = 'local') {
  const git = ensureRepo(rootDir);
  if (!git) return;
  await git.addConfig(key, value, scope === 'global' || scope === 'global' ? 'global' : 'local');
}

module.exports = {
  isGitAvailable,
  ensureRepo,
  status,
  initRepo,
  addRemote,
  commitAll,
  push,
  pushAuth,
  setUpstream,
  ensureIdentity,
  currentBranch,
  revParse,
  commitMessagesSince,
  changedFilesSince,
  pushRefspec,
  rawAdd,
  rawCommit,
  setConfig,
};
