'use strict';

/**
 * GitHub API 封装（基于 REST v3，使用 fetch + PAT）
 *
 * 文档：https://docs.github.com/en/rest
 */

const API = 'https://api.github.com';

function headers(token, extra) {
  const h = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'opu-cli',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return Object.assign(h, extra || {});
}

async function handle(res, ctx) {
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  if (!res.ok) {
    const msg = (body && body.message) || `${ctx} failed (HTTP ${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function whoami(token) {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  return handle(res, 'whoami');
}

async function repoExists(token, owner, repo) {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (res.status === 404) return null;
  return handle(res, 'repoExists');
}

async function createRepo(token, opts) {
  const body = {
    name: opts.repo,
    description: opts.description || '',
    private: opts.visibility === 'private',
    homepage: opts.homepage || '',
    has_issues: true,
    has_projects: false,
    has_wiki: false,
    auto_init: false,
    license_template: opts.license || 'mit',
  };
  const res = await fetch(`${API}/user/repos`, {
    method: 'POST',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return handle(res, 'createRepo');
}

async function setTopics(token, owner, repo, topics) {
  const res = await fetch(`${API}/repos/${owner}/${repo}/topics`, {
    method: 'PUT',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ names: topics || [] }),
  });
  return handle(res, 'setTopics');
}

async function setDescription(token, owner, repo, description) {
  // 通过 PATCH /repos
  const res = await fetch(`${API}/repos/${owner}/${repo}`, {
    method: 'PATCH',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ description }),
  });
  return handle(res, 'setDescription');
}

async function getUsername(token) {
  const me = await whoami(token);
  return me.login;
}

async function setDefaultBranch(token, owner, repo, branch) {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, {
    method: 'PATCH',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ default_branch: branch }),
  });
  return handle(res, 'setDefaultBranch');
}

module.exports = {
  API,
  whoami,
  repoExists,
  createRepo,
  setTopics,
  setDescription,
  getUsername,
  setDefaultBranch,
};
