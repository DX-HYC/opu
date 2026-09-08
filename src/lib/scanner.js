'use strict';

// 默认搜索引擎：跳过对 node_modules、.git 等的递归
const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  '.vscode',
  '.idea',
  '__pycache__',
  'venv',
  '.venv',
  'coverage',
  '.DS_Store',
  'Thumbs.db',
]);

const MAX_FILES_SAMPLE = 60;       // 最多采样的源码文件数
const MAX_FILE_BYTES = 200 * 1024; // 单文件超过该值只采样首部

function shouldIgnore(name) {
  return DEFAULT_IGNORE.has(name) || name.startsWith('.git');
}

function isTextLike(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')
    || lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.ico')
    || lower.endsWith('.pdf') || lower.endsWith('.zip') || lower.endsWith('.tar')
    || lower.endsWith('.gz') || lower.endsWith('.7z') || lower.endsWith('.rar')
    || lower.endsWith('.mp4') || lower.endsWith('.mp3') || lower.endsWith('.mov')
    || lower.endsWith('.exe') || lower.endsWith('.dll') || lower.endsWith('.so')
    || lower.endsWith('.dylib')) {
    return false;
  }
  return true;
}

function isSourceFile(name) {
  const lower = name.toLowerCase();
  const exts = [
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
    '.c', '.cc', '.cpp', '.h', '.hpp',
    '.vue', '.svelte',
    '.html', '.htm', '.css', '.scss', '.less',
    '.json', '.yml', '.yaml', '.toml', '.ini',
    '.md', '.txt', '.rst',
    '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
    '.sql', '.graphql', '.proto',
    '.php', '.lua',
  ];
  return exts.some((ext) => lower.endsWith(ext));
}

/**
 * 项目扫描：识别技术栈、读 manifest、采样源码片段
 */
async function scan(rootDir, options = {}) {
  const fs = require('fs').promises;
  const path = require('path');

  const result = {
    root: rootDir,
    name: path.basename(rootDir),
    techStack: [],
    manifests: {},
    structure: [],
    sourceSamples: [],
    entryPoints: [],
  };

  // 1) 读取常见 manifest
  const manifestFiles = [
    'package.json',
    'pyproject.toml',
    'requirements.txt',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'composer.json',
    'Gemfile',
    'manifest.json',
  ];
  for (const m of manifestFiles) {
    try {
      const full = path.join(rootDir, m);
      const stat = await fs.stat(full);
      if (stat.isFile()) {
        result.manifests[m] = await fs.readFile(full, 'utf8');
      }
    } catch (_) { /* ignore */ }
  }

  // 2) 推断技术栈
  if (result.manifests['package.json']) {
    try {
      const pkg = JSON.parse(result.manifests['package.json']);
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      result.name = pkg.name || result.name;
      if (pkg.description) result.tagline = pkg.description;
      if (pkg.homepage) result.homepage = pkg.homepage;
      if (pkg.repository && pkg.repository.url) result.repositoryUrl = pkg.repository.url;
      const stackHints = {
        react: 'React', vue: 'Vue', next: 'Next.js', nuxt: 'Nuxt',
        svelte: 'Svelte', angular: 'Angular', express: 'Express',
        koa: 'Koa', nestjs: 'NestJS', electron: 'Electron',
        'chrome-extension': 'Chrome Extension',
        webextension: 'WebExtension',
        manifest: 'WebExtension Manifest',
      };
      for (const dep of Object.keys(allDeps)) {
        const lower = dep.toLowerCase();
        for (const k of Object.keys(stackHints)) {
          if (lower.includes(k) && !result.techStack.includes(stackHints[k])) {
            result.techStack.push(stackHints[k]);
          }
        }
      }
      if (pkg.scripts && pkg.scripts.start) result.entryPoints.push('npm start');
      if (pkg.scripts && pkg.scripts.build) result.entryPoints.push('npm run build');
    } catch (_) { /* ignore json parse error */ }
  }
  if (result.manifests['pyproject.toml']) {
    result.techStack.push('Python');
    if (/django/i.test(result.manifests['pyproject.toml'])) result.techStack.push('Django');
    if (/flask/i.test(result.manifests['pyproject.toml'])) result.techStack.push('Flask');
    if (/fastapi/i.test(result.manifests['pyproject.toml'])) result.techStack.push('FastAPI');
  }
  if (result.manifests['Cargo.toml']) result.techStack.push('Rust');
  if (result.manifests['go.mod']) result.techStack.push('Go');
  if (result.manifests['requirements.txt']) result.techStack.push('Python');

  // 浏览器扩展识别
  const manifestJsonPath = path.join(rootDir, 'manifest.json');
  try {
    const stat = await fs.stat(manifestJsonPath);
    if (stat.isFile()) {
      const content = await fs.readFile(manifestJsonPath, 'utf8');
      try {
        const m = JSON.parse(content);
        if (m.manifest_version) {
          result.techStack.push('Browser Extension');
          result.extensionManifest = m;
          if (m.name) result.name = m.name;
        }
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }

  // 3) 采样源码
  async function walk(dir, depth) {
    if (depth > options.maxDepth || depth > 6) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (_) { return; }
    for (const ent of entries) {
      if (shouldIgnore(ent.name)) continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.isFile() && isTextLike(ent.name)) {
        result.structure.push(rel);
        if (
          isSourceFile(ent.name)
          && result.sourceSamples.length < MAX_FILES_SAMPLE
        ) {
          try {
            const stat = await fs.stat(full);
            if (stat.size > MAX_FILE_BYTES) {
              const fd = await fs.open(full, 'r');
              const buf = Buffer.alloc(MAX_FILE_BYTES);
              await fd.read(buf, 0, MAX_FILE_BYTES, 0);
              await fd.close();
              result.sourceSamples.push({
                path: rel,
                content: buf.toString('utf8') + '\n... (truncated)',
              });
            } else {
              const content = await fs.readFile(full, 'utf8');
              result.sourceSamples.push({ path: rel, content });
            }
          } catch (_) { /* ignore */ }
        }
      }
    }
  }
  await walk(rootDir, 0);

  // 截断结构列表
  if (result.structure.length > 200) {
    result.structure = result.structure.slice(0, 200);
    result.structureTruncated = true;
  }
  return result;
}

module.exports = { scan };
