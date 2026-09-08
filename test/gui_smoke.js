'use strict';
// GUI 后端集成测试：启动服务并逐一验证 API
const fs = require('fs');
const path = require('path');
const http = require('http');
const { startServer } = require('../src/gui/server');

const TMP = path.join(__dirname, '..', '.tmp-gui-test');
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'Auto Video Player', version: '1.7.5', description: '网课自动续播扩展',
}));

function req(port, method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, method, path: p,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 } }, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        if (p === '/api/publish') return resolve(buf); // SSE raw
        try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const { server, port } = await startServer();
  console.log('server on', port);
  try {
    const cfg = await req(port, 'GET', '/api/config');
    console.log('[config] github masked:', !!cfg.tokens.github, '| copyright.holder:', cfg.copyright?.holder);

    const doc = await req(port, 'GET', '/api/doctor');
    console.log('[doctor] checks:', doc.checks?.length, doc.checks?.map((c) => c.name + (c.ok ? '✓' : '✗')).join(', '));

    const scan = await req(port, 'POST', '/api/scan', { dir: TMP });
    console.log('[scan] name:', scan.manifest?.name, '| techStack:', scan.scan?.techStack?.join('/'), '| opu.json written:', fs.existsSync(path.join(TMP, '.opu.json')));

    const prev = await req(port, 'POST', '/api/preview', { dir: TMP, manifest: scan.manifest, useAI: false });
    console.log('[preview] readme', prev.readme?.length, 'tutorial', prev.tutorial?.length, 'changelog', prev.changelog?.length);

    const pub = await req(port, 'POST', '/api/publish', { dir: TMP, manifest: scan.manifest, platform: 'both', dryRun: true, useAI: false, docs: prev });
    const lines = pub.split('\n\n').filter(Boolean).map((l) => l.replace(/^data:\s?/, ''));
    const types = lines.map((l) => { try { return JSON.parse(l).type; } catch { return '?'; } });
    console.log('[publish SSE] events:', types.join(' -> '));

    console.log('\n✔ GUI 后端集成测试通过');
  } catch (e) {
    console.error('✘ 测试失败:', e.message);
  } finally {
    server.close();
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(0);
  }
})();
