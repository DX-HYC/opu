'use strict';

/**
 * Gitee API v5 封装
 * 文档：https://gitee.com/api/v5/swagger
 */

const API = 'https://gitee.com/api/v5';

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function handle(res, ctx) {
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  if (!res.ok) {
    const msg = (body && body.message) || body?.error_description || `${ctx} failed (HTTP ${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// Gitee 鉴权：把 token 放在 query 参数 access_token（Gitee 官方推荐方式）。
// 注意：不要使用 GitHub 风格的 `Authorization: Bearer`，Gitee 不认。
function headers(extra) {
  return Object.assign({ 'User-Agent': 'opu-cli' }, extra || {});
}

async function whoami(token) {
  const res = await fetch(`${API}/user?${qs({ access_token: token })}`, { headers: headers() });
  return handle(res, 'whoami');
}

async function getUsername(token) {
  const me = await whoami(token);
  return me.login;
}

async function repoExists(token, owner, repo) {
  const res = await fetch(`${API}/repos/${owner}/${repo}?${qs({ access_token: token })}`, { headers: headers() });
  if (res.status === 404) return null;
  return handle(res, 'repoExists');
}

async function createRepo(token, opts) {
  const body = {
    access_token: token,
    name: opts.repo,
    description: opts.description || '',
    homepage: opts.homepage || '',
    has_issues: true,
    has_wiki: false,
    auto_init: false,
    private: opts.visibility === 'private',
    license: opts.license || 'MIT-license',
  };
  const res = await fetch(`${API}/user/repos?${qs({ access_token: token })}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const created = handle(res, 'createRepo');
  // Gitee 建仓时 private 参数不可靠（账户默认值会覆盖），建仓后按可见性再 PATCH 一次确保生效
  const wantPrivate = opts.visibility === 'private';
  if (typeof created.private === 'boolean' && created.private !== wantPrivate) {
    try {
      await setVisibility(token, opts.repo, wantPrivate);
    } catch (_) { /* 非关键：失败不影响代码已推送 */ }
  }
  return created;
}

async function setVisibility(token, repo, isPrivate) {
  const me = await whoami(token);
  const res = await fetch(`${API}/repos/${me.login}/${repo}?${qs({ access_token: token })}`, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: repo, private: !!isPrivate }),
  });
  return handle(res, 'setVisibility');
}

async function setTopics(token, owner, repo, topics) {
  // Gitee 没有独立 topics 接口；通过 PATCH repo 尝试设置（需带 name 字段，否则 400）
  try {
    const res = await fetch(`${API}/repos/${owner}/${repo}?${qs({ access_token: token })}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: repo, topics: Array.isArray(topics) ? topics.join(',') : '' }),
    });
    return handle(res, 'setTopics');
  } catch (err) {
    // Gitee 部分版本不支持该字段，失败不阻塞发布
    return null;
  }
}

async function setDescription(token, owner, repo, description) {
  const res = await fetch(`${API}/repos/${owner}/${repo}?${qs({ access_token: token })}`, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: repo, description }),
  });
  return handle(res, 'setDescription');
}

// 设默认分支（best-effort：Gitee 部分版本/字段支持有限，失败不影响已推送的代码）
async function setDefaultBranch(token, owner, repo, branch) {
  try {
    const res = await fetch(`${API}/repos/${owner}/${repo}?${qs({ access_token: token })}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: repo, default_branch: branch }),
    });
    return handle(res, 'setDefaultBranch');
  } catch (err) {
    return null;
  }
}

module.exports = {
  API,
  whoami,
  getUsername,
  repoExists,
  createRepo,
  setVisibility,
  setTopics,
  setDescription,
  setDefaultBranch,
};
