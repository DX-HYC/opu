'use strict';

/**
 * opu GUI 后端 — 纯 Node 内置模块实现，零额外依赖
 *  - 仅绑定 127.0.0.1，不对外暴露
 *  - 提供 REST + SSE 接口，供浏览器前端调用
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const cfg = require('../lib/config');
const manifest = require('../lib/manifest');
const scanner = require('../lib/scanner');
const github = require('../lib/github');
const gitee = require('../lib/gitee');
const ai = require('../lib/ai');
const tpl = require('../lib/templates');
const publisher = require('../lib/publisher');
const licenseTexts = require('../commands/license_texts');

const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 工具 ----------

function maskSecret(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length <= 8) return '********';
  return s.slice(0, 4) + '****' + s.slice(-4);
}

// 若传入值形如已脱敏（含 ****），视为「未更改」，返回 null 表示忽略
function isMasked(v) {
  return typeof v === 'string' && v.includes('****');
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 8 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

function isSafeDir(dir) {
  // 基础防越权：拒绝明显危险的路径，但允许用户在自己机器上选任意目录
  if (!dir || typeof dir !== 'string') return false;
  const d = path.resolve(dir);
  // 不允许指向系统根或关键目录（极简防护）
  const forbidden = ['C:\\', 'C:/', '/', '/etc', '/sys', '/proc'];
  if (forbidden.includes(d)) return false;
  return true;
}

// ---------- 静态文件 ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // 支持 /static/* 别名（前端以 /static/xxx 引用）
  if (rel.startsWith('/static/')) rel = rel.slice('/static'.length);
  // 防目录穿越
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---------- API ----------

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method.toUpperCase();

  // 配置读取（脱敏）
  if (pathname === '/api/config' && method === 'GET') {
    const c = cfg.readAll();
    return sendJson(res, 200, {
      tokens: {
        github: maskSecret(c.tokens.github),
        gitee: maskSecret(c.tokens.gitee),
      },
      ai: {
        provider: c.ai.provider,
        apiKey: maskSecret(c.ai.apiKey),
        baseUrl: c.ai.baseUrl,
        model: c.ai.model,
      },
      defaults: c.defaults,
      copyright: c.copyright,
    });
  }

  // 配置写入（updates: { "tokens.github": "xxx" }）
  if (pathname === '/api/config' && method === 'POST') {
    const body = await readBody(req);
    const updates = body.updates || {};
    let changed = 0;
    for (const [k, v] of Object.entries(updates)) {
      if (isMasked(v)) continue; // 用户未改，跳过
      cfg.set(k, v);
      changed++;
    }
    return sendJson(res, 200, { ok: true, changed });
  }

  // 测试 token / AI（独立校验，便于前端点击「测试」）
  if (pathname === '/api/config/test' && method === 'POST') {
    const body = await readBody(req);
    const field = body.field; // 'tokens.github' | 'tokens.gitee' | 'ai.apiKey'
    const value = body.value;
    const token = isMasked(value) ? cfg.get(field) : value;
    if (!token) return sendJson(res, 200, { ok: false, detail: '值为空' });
    try {
      if (field === 'tokens.github') {
        const me = await github.whoami(token);
        return sendJson(res, 200, { ok: true, detail: `GitHub 已认证：${me.login}` });
      }
      if (field === 'tokens.gitee') {
        const me = await gitee.whoami(token);
        return sendJson(res, 200, { ok: true, detail: `Gitee 已认证：${me.login}` });
      }
      if (field === 'ai.apiKey') {
        // 轻量 ping：用一个极短 prompt 验证 key 可用
        await ai.callProvider(
          { provider: 'deepseek', apiKey: token, baseUrl: body.baseUrl || 'https://api.deepseek.com', model: body.model || 'deepseek-chat' },
          [{ role: 'user', content: 'ping' }],
          { maxTokens: 4 }
        );
        return sendJson(res, 200, { ok: true, detail: 'DeepSeek 连接成功' });
      }
      return sendJson(res, 200, { ok: false, detail: '未知字段' });
    } catch (err) {
      return sendJson(res, 200, { ok: false, detail: `校验失败：${err.message}` });
    }
  }

  // 环境检查
  if (pathname === '/api/doctor' && method === 'GET') {
    const summary = [];
    const c = cfg.readAll();
    const gitOk = await gitIsAvailable();
    summary.push({ name: 'Git', ok: gitOk, detail: gitOk ? '已安装' : '未检测到 git 命令' });
    if (c.tokens.github) {
      try { const me = await github.whoami(c.tokens.github); summary.push({ name: 'GitHub Token', ok: true, detail: `已认证：${me.login}` }); }
      catch (e) { summary.push({ name: 'GitHub Token', ok: false, detail: `认证失败：${e.message}` }); }
    } else summary.push({ name: 'GitHub Token', ok: false, detail: '未配置' });
    if (c.tokens.gitee) {
      try { const me = await gitee.whoami(c.tokens.gitee); summary.push({ name: 'Gitee Token', ok: true, detail: `已认证：${me.login}` }); }
      catch (e) { summary.push({ name: 'Gitee Token', ok: false, detail: `认证失败：${e.message}` }); }
    } else summary.push({ name: 'Gitee Token', ok: false, detail: '未配置' });
    if (c.ai?.apiKey) summary.push({ name: 'AI (DeepSeek)', ok: true, detail: `${c.ai.provider} @ ${c.ai.baseUrl}` });
    else summary.push({ name: 'AI (DeepSeek)', ok: false, detail: '未配置' });
    return sendJson(res, 200, { checks: summary });
  }

  // 扫描项目 + 生成默认 .opu.json（若不存在）
  if (pathname === '/api/scan' && method === 'POST') {
    const body = await readBody(req);
    const dir = body.dir;
    if (!isSafeDir(dir)) return sendJson(res, 400, { error: '目录不合法' });
    let m;
    if (manifest.exists(dir)) {
      m = manifest.read(dir);
    } else {
      const scanResult = await scanner.scan(dir, { maxDepth: 4 });
      const name = scanResult.name;
      m = manifest.empty(name, dir);
      m = manifest.fillDefaults(m, scanResult);
      // 浏览器扩展自动补 entryPoints
      if (scanResult.techStack.includes('Browser Extension') && (!m.entryPoints || m.entryPoints.length === 0)) {
        m.entryPoints = [
          '打开浏览器扩展管理页（chrome://extensions 或 edge://extensions）',
          '开启右上角「开发者模式」',
          '点击「加载已解压的扩展程序」，选择本项目根目录',
        ];
        if (!m.features || m.features.length === 0) {
          m.features = ['自动恢复暂停的视频播放', '自动跳转到下一个视频实现连播', '读取进度条数据（currentTime / duration）'];
        }
      }
      if (!m.platforms) m.platforms = { github: { owner: '', repo: m.name, visibility: 'public' }, gitee: { owner: '', repo: m.name, visibility: 'public' } };
      manifest.write(dir, m);
    }
    const scanResult = await scanner.scan(dir, { maxDepth: 3 });
    return sendJson(res, 200, {
      manifest: m,
      scan: {
        techStack: scanResult.techStack,
        fileCount: scanResult.structure.length,
        hasGit: fs.existsSync(path.join(dir, '.git')),
      },
    });
  }

  // 保存项目 manifest
  if (pathname === '/api/manifest' && method === 'POST') {
    const body = await readBody(req);
    if (!isSafeDir(body.dir)) return sendJson(res, 400, { error: '目录不合法' });
    manifest.write(body.dir, body.manifest);
    return sendJson(res, 200, { ok: true });
  }

  // 文档预览（不写盘，仅返回文本供编辑）
  if (pathname === '/api/preview' && method === 'POST') {
    const body = await readBody(req);
    const dir = body.dir;
    if (!isSafeDir(dir)) return sendJson(res, 400, { error: '目录不合法' });
    const m = body.manifest || (manifest.exists(dir) ? manifest.read(dir) : manifest.empty(path.basename(dir), dir));
    const scanResult = await scanner.scan(dir, { maxDepth: 3 });
    const ctx = {
      name: m.displayName || m.name,
      displayName: m.displayName,
      tagline: m.tagline,
      techStack: m.techStack || scanResult.techStack,
      features: m.features || [],
      entryPoints: m.entryPoints || scanResult.entryPoints || [],
      requirements: m.requirements || {},
      extraContext: m.ai?.extraContext || '',
      structure: scanResult.structure,
      sourceSamples: scanResult.sourceSamples,
    };
    const c = cfg.readAll();
    const useAI = body.useAI !== false && m.ai?.enabled !== false;
    let readme, tutorial, changelog;
    if (useAI && c.ai?.apiKey) {
      try { readme = await ai.generate('readme', ctx, c.ai); } catch (e) { readme = tpl.fallbackReadme(m); }
      try { tutorial = await ai.generate('tutorial', ctx, c.ai); } catch (e) { tutorial = tpl.fallbackTutorial(m); }
      try { changelog = await ai.generate('changelog', ctx, c.ai); } catch (e) { changelog = tpl.fallbackChangelog(m); }
    } else {
      readme = tpl.fallbackReadme(m);
      tutorial = tpl.fallbackTutorial(m);
      changelog = tpl.fallbackChangelog(m);
    }
    return sendJson(res, 200, { readme, tutorial, changelog });
  }

  // 发布（SSE 流式）
  if (pathname === '/api/publish' && method === 'POST') {
    return handlePublishSSE(req, res);
  }

  return sendJson(res, 404, { error: '未知接口' });
}

function handlePublishSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  readBody(req).then(async (body) => {
    const dir = body.dir;
    if (!isSafeDir(dir)) { send({ type: 'error', message: '目录不合法' }); return res.end(); }
    // 先保存 manifest
    if (body.manifest) {
      try { manifest.write(dir, body.manifest); } catch (e) { /* ignore */ }
    }
    const onLog = (level, msg) => send({ type: 'log', level, msg });
    send({ type: 'start' });
    try {
      const result = await publisher.runPublish({
        cwd: dir,
        platform: body.platform || 'both',
        dryRun: !!body.dryRun,
        useAI: body.useAI !== false,
        message: body.message || 'chore: publish via opu',
        docsOverride: body.docs || {},
        onLog,
      });
      send({ type: 'done', results: result.results });
    } catch (err) {
      send({ type: 'error', message: err.message });
    } finally {
      res.end();
    }
  }).catch((err) => {
    send({ type: 'error', message: err.message });
    res.end();
  });
}

let _gitProbe = null;
async function gitIsAvailable() {
  if (_gitProbe !== null) return _gitProbe;
  const { spawn } = require('child_process');
  _gitProbe = await new Promise((resolve) => {
    const p = spawn('git', ['--version']);
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('close', (code) => resolve(code === 0 && /git version/i.test(out)));
    p.on('error', () => resolve(false));
  });
  return _gitProbe;
}

// ---------- 启动 ----------

function startServer(portArg) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1`);
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch((err) => {
        if (!res.headersSent) sendJson(res, 500, { error: err.message });
        else res.end();
      });
      return;
    }
    serveStatic(req, res, url.pathname);
  });

  return new Promise((resolve, reject) => {
    const port = portArg && !isNaN(portArg) ? portArg : 0;
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      resolve({ server, port: actualPort });
    });
  });
}

module.exports = { startServer };
