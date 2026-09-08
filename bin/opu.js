#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

// 读取 package.json 注入版本号
const pkg = require('../package.json');

const program = new Command();

program
  .name('opu')
  .description('开源项目自动化提交程序 — 一键把 WorkBuddy 中开发的项目发布到 GitHub / Gitee')
  .version(pkg.version, '-v, --version')
  .option('--cwd <dir>', '指定项目目录（默认当前目录）', process.cwd());

// 命令注册
const commands = [
  'init',
  'doctor',
  'config',
  'publish',
  'sync',
  'gui',
];

for (const name of commands) {
  try {
    require(path.join(__dirname, '..', 'src', 'commands', `${name}.js`))({ program, pkg });
  } catch (err) {
    // 静默忽略未实现的命令（开发期）
    if (process.env.OPU_DEBUG) {
      console.error(`[opu] failed to load command ${name}:`, err.message);
    }
  }
}

// 兜底：未匹配命令
program.on('command:*', () => {
  console.error(`未知的子命令：${program.args.join(' ')}`);
  console.log('运行 `opu --help` 查看支持的命令');
  process.exit(1);
});

program.parseAsync(process.argv).catch((err) => {
  console.error('opu 执行失败：', err.message);
  if (process.env.OPU_DEBUG) console.error(err.stack);
  process.exit(1);
});
