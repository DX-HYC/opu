'use strict';

/**
 * WorkBuddy 项目识别：
 *  - 让 opu init 时能自动发现"在 WorkBuddy 里开发的项目"
 *  - 不强依赖 WorkBuddy 内部接口；通过约定的扫描 + 索引读取做兜底
 *
 * 主要入口：
 *  - `listFromIndex(indexRoot)`：从 WorkBuddy artifact-index 读项目线索
 *  - `pickProject(cwd)`：用扫描+索引推一个最可能的项目根
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CANDIDATE_INDEX_ROOTS = [
  path.join(os.homedir(), '.workbuddy', 'artifact-index'),
  path.join(os.homedir(), '.workbuddy', 'changes-index'),
];

function listJsonFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_) { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.json')) {
        out.push(full);
      }
    }
  };
  walk(root, 0);
  return out;
}

/**
 * 从 WorkBuddy artifact-index 目录里"扫一遍"，
 * 抽出形如 { name, path, lastModified } 的项目候选。
 *
 * 不假设固定 schema，宽松解析。
 */
function listFromIndex(indexRoot) {
  const candidates = [];
  const files = listJsonFiles(indexRoot);
  for (const f of files) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const name = item.name || item.title || item.displayName || item.projectName;
      const p = item.path || item.projectPath || item.root || item.cwd;
      if (name && p && typeof p === 'string') {
        candidates.push({
          name,
          path: p,
          lastModified: item.lastModified || item.updatedAt || item.mtime || null,
          source: f,
        });
      }
    }
  }
  return candidates;
}

async function listAll(cwd) {
  const all = [];
  for (const root of CANDIDATE_INDEX_ROOTS) {
    const items = listFromIndex(root);
    for (const it of items) all.push(it);
  }
  // 兜底：当前目录 + 它的父/同级目录
  const looksLikeProject = (p) => {
    if (!p || !fs.existsSync(p)) return false;
    try {
      return fs.readdirSync(p).some((n) => n === 'package.json' || n === 'manifest.json' || n === 'pyproject.toml');
    } catch (_) {
      return false;
    }
  };
  const parent = path.dirname(cwd);
  const siblings = (parent && fs.existsSync(parent)) ? fs.readdirSync(parent) : [];
  for (const s of siblings) {
    const p = path.join(parent, s);
    if (looksLikeProject(p)) {
      all.push({ name: s, path: p, lastModified: null, source: 'cwd-sibling-scan' });
    }
  }
  return all;
}

module.exports = {
  CANDIDATE_INDEX_ROOTS,
  listFromIndex,
  listAll,
};
