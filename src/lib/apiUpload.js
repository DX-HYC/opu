'use strict';
/**
 * GitHub Contents API 上传通道。
 * 当 git push 因网络/代理（如 CONNECT 隧道 502）失败时，opu 降级为
 * 直接调用 GitHub REST API 把文件 PUT 进仓库，绕过 git 的传输层。
 * 复用与 createRepo 相同的 node fetch 通路（已验证在用户环境可用）。
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_EXCLUDE = ['.git', 'node_modules', '.opu.json', '.workbuddy'];

function collectFiles(cwd, extraExclude = []) {
  const skip = new Set([...DEFAULT_EXCLUDE, ...extraExclude]);
  const out = [];
  (function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      const relPath = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(full, relPath);
      else if (e.isFile()) out.push({ full, rel: relPath });
    }
  })('', '');
  return out;
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'opu-cli',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

async function getDefaultBranch(owner, repo, token) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) return 'main';
  const j = await res.json();
  return j.default_branch || 'main';
}

async function putOne(owner, repo, token, branch, file, message) {
  const content = fs.readFileSync(file.full).toString('base64');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(file.rel)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, content, branch }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`上传 ${file.rel} 失败 (HTTP ${res.status}): ${t.slice(0, 240)}`);
  }
  return res.status;
}

/**
 * 上传整个仓库目录到 GitHub（通过 Contents API）。
 * @returns {{uploaded:number,total:number,branch:string}}
 */
async function uploadRepoViaApi({ owner, repo, token, cwd, message = 'Publish via opu', exclude = [], onProgress }) {
  const branch = await getDefaultBranch(owner, repo, token);
  const files = collectFiles(cwd, exclude);
  let n = 0;
  for (const f of files) {
    await putOne(owner, repo, token, branch, f, message);
    n += 1;
    if (onProgress) onProgress(f.rel, n, files.length);
  }
  return { uploaded: n, total: files.length, branch };
}

module.exports = { collectFiles, uploadRepoViaApi, getDefaultBranch, putOne };
