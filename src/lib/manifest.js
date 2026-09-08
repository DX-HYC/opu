'use strict';

/**
 * 项目级 manifest — 写在项目根的 .opu.json
 *
 * 结构：
 * {
 *   "name": "auto-video-player",
 *   "displayName": "Auto Video Player",
 *   "tagline": "一句话描述",
 *   "description": "完整描述（多段）",
 *   "features": ["..."],
 *   "techStack": ["Chrome Extension", "Manifest V3"],
 *   "license": "MIT",
 *   "topics": ["chrome-extension", "video"],
 *   "platforms": {
 *     "github": { "owner": "xxx", "repo": "auto-video-player" },
 *     "gitee":  { "owner": "xxx", "repo": "auto-video-player" }
 *   },
 *   "entryPoints": ["Load unpacked in chrome://extensions"],
 *   "requirements": { "node": ">=18" },
 *   "ai": {
 *     "enabled": true,
 *     "extraContext": "项目的额外说明，会作为 AI prompt 的一部分"
 *   },
 *   "docs": {
 *     "readme": "如果用户已经在 WorkBuddy 里编辑好，存到这里并设 ai.enabled=false"
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const FILENAME = '.opu.json';

function filePath(rootDir) {
  return path.join(rootDir || process.cwd(), FILENAME);
}

function exists(rootDir) {
  return fs.existsSync(filePath(rootDir));
}

function read(rootDir) {
  const p = filePath(rootDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`${FILENAME} JSON 解析失败：${err.message}`);
  }
}

function write(rootDir, data) {
  fs.writeFileSync(filePath(rootDir), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function empty(name, rootDir) {
  return {
    name: name || path.basename(rootDir || process.cwd()),
    tagline: '',
    description: '',
    features: [],
    techStack: [],
    license: 'MIT',
    topics: [],
    platforms: {
      github: { owner: '', repo: name || path.basename(rootDir || process.cwd()) },
      gitee: { owner: '', repo: name || path.basename(rootDir || process.cwd()) },
    },
    entryPoints: [],
    requirements: {},
    ai: { enabled: true, extraContext: '' },
    docs: { readme: '', changelog: '' },
  };
}

/**
 * 把 manifest 中的空字段用 scan 结果补全
 */
function fillDefaults(manifest, scanResult) {
  if (!manifest) return manifest;
  if (!manifest.name && scanResult.name) manifest.name = scanResult.name;
  if (!manifest.tagline && scanResult.tagline) manifest.tagline = scanResult.tagline;
  if (!manifest.techStack || manifest.techStack.length === 0) {
    manifest.techStack = scanResult.techStack || [];
  }
  if (scanResult.entryPoints && (!manifest.entryPoints || manifest.entryPoints.length === 0)) {
    manifest.entryPoints = scanResult.entryPoints;
  }
  return manifest;
}

module.exports = {
  FILENAME,
  filePath,
  exists,
  read,
  write,
  empty,
  fillDefaults,
};
