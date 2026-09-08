'use strict';

/**
 * 终端 UI 工具 — chalk 颜色 / 简单 spinner / 分隔线 / 错误分类
 */

const chalk = require('chalk');

let Ora;
try {
  Ora = require('ora');
} catch (_) {
  Ora = null;
}

const CI = process.env.CI === 'true' || process.env.OPU_NO_SPINNER === '1';

function red(s) { return chalk.red(s); }
function green(s) { return chalk.green(s); }
function yellow(s) { return chalk.yellow(s); }
function blue(s) { return chalk.blue(s); }
function cyan(s) { return chalk.cyan(s); }
function gray(s) { return chalk.gray(s); }
function bold(s) { return chalk.bold(s); }
function dim(s) { return chalk.dim(s); }

function line(char = '─', width = 60) {
  return char.repeat(width);
}

function header(title) {
  return `\n${cyan(line('═', 60))}\n${bold(cyan(`  ${title}`))}\n${cyan(line('═', 60))}\n`;
}

function ok(msg) { return `${green('✔')} ${msg}`; }
function info(msg) { return `${blue('ℹ')} ${msg}`; }
function warn(msg) { return `${yellow('⚠')} ${msg}`; }
function err(msg) { return `${red('✖')} ${msg}`; }

function spinner(text) {
  if (!Ora || CI) {
    return {
      start() { console.log(`${gray('…')} ${text}`); return this; },
      succeed(m = text) { console.log(ok(m)); return this; },
      fail(m = text) { console.log(err(m)); return this; },
      warn(m = text) { console.log(warn(m)); return this; },
      stop() { return this; },
      text,
    };
  }
  return new Ora({ text, color: 'cyan' });
}

function table(rows, headers) {
  if (!rows || rows.length === 0) return '';
  const cols = headers || Object.keys(rows[0]);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const fmt = (vals) => vals.map((v, i) => String(v ?? '').padEnd(widths[i])).join('  ');
  const lines = [];
  lines.push(bold(gray(fmt(cols))));
  lines.push(gray(cols.map((_, i) => '-'.repeat(widths[i])).join('  ')));
  for (const r of rows) lines.push(fmt(cols.map((c) => r[c])));
  return lines.join('\n');
}

module.exports = {
  red, green, yellow, blue, cyan, gray, bold, dim,
  line, header, ok, info, warn, err,
  spinner, table,
};
