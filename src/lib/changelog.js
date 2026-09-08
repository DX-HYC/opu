'use strict';

/**
 * 更新日志（CHANGELOG）处理
 *
 * 设计目标（对应需求）：
 *  - 每次发布都「追加」一条本次更新，绝不覆盖历史。
 *  - 能自动判断是不是同一个项目 / 同一版本：靠 runPublish 传入的 baselineSha
 *    （上次发布的 commit，或已存在仓库的当前 HEAD）来 diff 出「本次改了什么」。
 *  - 版本号自动从项目的 manifest.json（浏览器扩展）或 package.json 读取。
 */

const fs = require('fs');
const path = require('path');
const git = require('./git');

// opu 每次发布会自动改写这些文件，不应算作「用户代码改动」计入更新日志
const GENERATED_DOCS = new Set([
  'README.md', 'TUTORIAL.md', 'CHANGELOG.md', 'NOTICE', 'LICENSE',
]);

/**
 * 从项目里探测版本号。
 * 优先级：浏览器扩展 manifest.json 的 version > Node package.json 的 version。
 * 返回字符串或 null。
 */
function detectVersion(cwd) {
  try {
    const mp = path.join(cwd, 'manifest.json');
    if (fs.existsSync(mp)) {
      const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
      if (m && m.version) return String(m.version);
    }
  } catch (_) { /* ignore */ }
  try {
    const pp = path.join(cwd, 'package.json');
    if (fs.existsSync(pp)) {
      const p = JSON.parse(fs.readFileSync(pp, 'utf8'));
      if (p && p.version) return String(p.version);
    }
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * 计算自 baselineSha 以来的变更摘要。
 * @param {string} cwd
 * @param {string|null} baselineSha 上次发布的 commit；null 表示「首次 / 无基线」
 * @returns {{commits:string[], files:string[], hasChanges:boolean}}
 */
function computeChangeSummary(cwd, baselineSha) {
  const result = { commits: [], files: [], hasChanges: false };
  if (!fs.existsSync(path.join(cwd, '.git'))) return result;

  result.commits = git.commitMessagesSince(cwd, baselineSha);
  const allFiles = git.changedFilesSince(cwd, baselineSha);
  result.files = allFiles
    .map((f) => f.trim())
    .filter((f) => f && !GENERATED_DOCS.has(path.basename(f)));

  result.hasChanges = result.commits.length > 0 || result.files.length > 0;
  return result;
}

/** 生成条目头，例如 "## v1.7.8 - 2026-09-07" */
function buildEntryHeader(version, date) {
  const v = version ? `v${String(version).replace(/^v/i, '')}` : 'unreleased';
  return `## ${v} - ${date}`;
}

/** 由版本/日期/正文（bullet 列表）拼出一条完整条目 */
function buildEntry({ version, date, body }) {
  const lines = [buildEntryHeader(version, date), ''];
  const bullets = (body || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const list = bullets.length ? bullets : ['- 更新与优化'];
  for (const b of list) lines.push(b.startsWith('-') ? b : `- ${b}`);
  lines.push('');
  return lines.join('\n');
}

function readChangelog(cwd) {
  const p = path.join(cwd, 'CHANGELOG.md');
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

function topEntryHeader(content) {
  const m = content.match(/^##\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * 把新条目追加到 CHANGELOG.md（保留历史）。
 * 插入位置：标题/前言之后、已有第一个 `## ` 之前（即 newest on top）。
 * 若顶部已存在完全相同（同版本同日期）的条目则跳过，避免重复。
 * @returns {boolean} 是否实际写入了新条目
 */
function appendChangelog(cwd, entry) {
  const existing = readChangelog(cwd);
  const newHeader = (entry.match(/^##\s+(.+)$/m) || [])[1];
  const curTop = topEntryHeader(existing);
  if (existing && newHeader && curTop === newHeader.trim()) {
    return false; // 已存在相同条目
  }

  if (!existing.trim()) {
    const out = [
      '# CHANGELOG',
      '',
      '本项目的所有重要变更都会记录在此文件中。',
      '',
      '格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。',
      '',
      entry,
    ].join('\n');
    fs.writeFileSync(path.join(cwd, 'CHANGELOG.md'), out, 'utf8');
    return true;
  }

  const idx = existing.search(/\n##\s/m);
  let out;
  if (idx === -1) {
    out = existing.replace(/\s*$/, '') + '\n\n' + entry + '\n';
  } else {
    out = existing.slice(0, idx + 1) + entry + '\n' + existing.slice(idx + 1);
  }
  fs.writeFileSync(path.join(cwd, 'CHANGELOG.md'), out, 'utf8');
  return true;
}

module.exports = {
  GENERATED_DOCS,
  detectVersion,
  computeChangeSummary,
  buildEntry,
  buildEntryHeader,
  appendChangelog,
  readChangelog,
  topEntryHeader,
};
