'use strict';

/**
 * 全局配置 — 存放在 ~/.opu/config.json
 * - tokens: github / gitee 的 PAT
 * - ai: provider 配置（默认 deepseek）
 * - defaults: 默认 license / visibility 等
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.opu');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  tokens: {
    github: '',
    gitee: '',
  },
  ai: {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  defaults: {
    license: 'MIT',
    visibility: 'public',
    syncChangelog: true,
  },
  copyright: {
    // 著作权人信息，应用到所有通过 opu 发布的项目
    holder: '',
    year: '',
    email: '',
  },
  workbuddy: {
    // auto-detect 的话，从这些候选目录里找项目
    enabled: false,
    roots: [],
  },
};

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readAll() {
  if (!fs.existsSync(CONFIG_PATH)) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // 深度合并默认值
    return deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), parsed);
  } catch (err) {
    console.error('配置文件损坏，重置默认：', err.message);
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function writeAll(cfg) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  // 设置 0600 文件权限（类 Unix 系统）
  try { fs.chmodSync(CONFIG_PATH, 0o600); } catch (_) { /* ignore on windows */ }
}

function deepMerge(base, extra) {
  if (extra == null || typeof extra !== 'object') return base;
  for (const key of Object.keys(extra)) {
    const v = extra[key];
    if (v && typeof v === 'object' && !Array.isArray(v)
        && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      base[key] = deepMerge(base[key], v);
    } else {
      base[key] = v;
    }
  }
  return base;
}

function get(keyPath) {
  const cfg = readAll();
  return keyPath.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), cfg);
}

function set(keyPath, value) {
  const cfg = readAll();
  const keys = keyPath.split('.');
  let cursor = cfg;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cursor[keys[i]] || typeof cursor[keys[i]] !== 'object') cursor[keys[i]] = {};
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
  writeAll(cfg);
  return cfg;
}

function path_() {
  return CONFIG_PATH;
}

module.exports = {
  DEFAULT_CONFIG,
  readAll,
  writeAll,
  get,
  set,
  path: path_,
};
