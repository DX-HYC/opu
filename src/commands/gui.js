'use strict';

const { spawn } = require('child_process');
const { startServer } = require('../gui/server');

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') cmd = ['open', [url]];
  else if (platform === 'win32') cmd = ['cmd', ['/c', 'start', '', url]];
  else cmd = ['xdg-open', [url]];
  try {
    const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true });
    p.unref();
  } catch (_) { /* 忽略：用户可手动打开终端打印的地址 */ }
}

module.exports = function ({ program, pkg }) {
  program
    .command('gui')
    .description('启动可视化发布控制台（浏览器界面，点点按钮即可发布）')
    .option('-p, --port <port>', '指定端口（默认自动分配）', (v) => parseInt(v, 10))
    .option('--no-open', '不自动打开浏览器')
    .action(async (opts) => {
      try {
        const { server, port } = await startServer(opts.port);
        const url = `http://127.0.0.1:${port}`;
        console.log('\n  开源项目自动化提交程序 · 可视化控制台已启动');
        console.log('  ➜  在浏览器打开： ' + url);
        console.log('  （仅绑定 127.0.0.1，本地安全；按 Ctrl+C 退出）\n');
        if (opts.open !== false) {
          // 稍等，确保服务已真正监听
          setTimeout(() => openBrowser(url), 400);
        }
        const shutdown = () => {
          console.log('\n  正在关闭控制台…');
          try { server.close(); } catch (_) {}
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (err) {
        console.error('启动可视化控制台失败：', err.message);
        process.exit(1);
      }
    });
};
