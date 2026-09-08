'use strict';

/**
 * 模板生成器 — 不依赖 AI 也能产出基本可用的文档
 * 当 AI 关闭或失败时，回退到这些模板
 */

const fs = require('fs');
const path = require('path');

function renderTemplate(name, ctx) {
  const tpl = fs.readFileSync(path.join(__dirname, '..', '..', 'templates', `${name}.md`), 'utf8');
  return tpl.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const v = ctx[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

function fallbackReadme(manifest) {
  const lines = [];
  const name = manifest.displayName || manifest.name;
  const repoName = manifest.platforms?.github?.repo || manifest.name;
  lines.push(`# ${name}`);
  lines.push('');
  if (manifest.tagline) {
    lines.push(`> ${manifest.tagline}`);
    lines.push('');
  }
  if (manifest.description) {
    lines.push(manifest.description);
    lines.push('');
  }
  if (manifest.techStack && manifest.techStack.length) {
    lines.push(`## 🧰 技术栈`);
    lines.push('');
    for (const t of manifest.techStack) lines.push(`- ${t}`);
    lines.push('');
  }
  if (manifest.features && manifest.features.length) {
    lines.push(`## ✨ 核心特性`);
    lines.push('');
    for (const f of manifest.features) lines.push(`- ${f}`);
    lines.push('');
  }
  lines.push(`## 🚀 快速开始`);
  lines.push('');
  if (manifest.entryPoints && manifest.entryPoints.length) {
    for (const e of manifest.entryPoints) lines.push(`- ${e}`);
  } else {
    lines.push('1. 克隆仓库');
    lines.push(`   \`\`\`bash\n   git clone https://github.com/<owner>/${repoName}.git\n   \`\`\``);
    lines.push('2. 进入目录，按需安装依赖');
    lines.push('3. 按项目类型运行相应命令');
  }
  lines.push('');
  lines.push(`## 🤝 贡献`);
  lines.push('');
  lines.push('欢迎 Issue / Pull Request。');
  lines.push('');
  lines.push(`## 📄 协议`);
  lines.push('');
  lines.push(`本项目基于 ${manifest.license || 'MIT'} 协议开源。`);
  return lines.join('\n');
}

function fallbackChangelog(manifest) {
  const date = new Date().toISOString().slice(0, 10);
  return [
    `# CHANGELOG`,
    ``,
    `本项目的所有重要变更都会记录在此文件中。`,
    ``,
    `格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。`,
    ``,
    `## [${manifest.version || '0.1.0'}] - ${date}`,
    ``,
    `### Added`,
  ].concat((manifest.features || []).map((f) => `- ${f}`)).concat([``, `## [未发布]`, ``, `- 进行中`, ``]).join('\n');
}

function fallbackTutorial(manifest) {
  return [
    `# 使用教程`,
    ``,
    `> 本教程面向第一次接触 **${manifest.displayName || manifest.name}** 的用户。`,
    ``,
    `## 1. 前置准备`,
    ``,
    manifest.platforms?.github?.repo ? `- Git\n- Node.js 18+（如项目需要）\n- 项目相关依赖（见 README）` : `- Git`,
    ``,
    `## 2. 克隆仓库`,
    ``,
    `\`\`\`bash`,
    `git clone https://github.com/${manifest.platforms?.github?.owner || '<owner>'}/${manifest.platforms?.github?.repo || manifest.name}.git`,
    `cd ${manifest.platforms?.github?.repo || manifest.name}`,
    `\`\`\``,
    ``,
    `## 3. 最小可用示例`,
    ``,
    manifest.entryPoints?.length
      ? manifest.entryPoints.map((e) => `- ${e}`).join('\n')
      : `- 按 README 快速开始章节操作`,
    ``,
    `## 4. 排错指南`,
    ``,
    `- 网络问题：请检查代理 / Git 凭据`,
    `- 权限问题：浏览器扩展请用「加载已解压的扩展程序」并开启「开发者模式」`,
    `- 其他：请提交 Issue 并附上日志`,
    ``,
    `## 5. 进阶阅读`,
    ``,
    `- [README](./README.md)`,
    ``,
  ].join('\n');
}

module.exports = {
  renderTemplate,
  fallbackReadme,
  fallbackChangelog,
  fallbackTutorial,
};
