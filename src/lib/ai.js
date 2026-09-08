'use strict';

/**
 * AI 文档生成 — 默认走 DeepSeek（OpenAI 兼容协议）
 * 替代 provider：任何 /v1/chat/completions 兼容端点
 *
 * 输出为纯文本（README Markdown），可被人工覆盖。
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PROMPTS = {
  readme: (ctx) => `你是一名资深的开源项目 README 撰写人，输出**纯 Markdown**。

# 任务
基于以下上下文，为开源项目「${ctx.name}」写一份完整的 README.md。

# 项目上下文
- 名称：${ctx.name}
${ctx.displayName ? `- 显示名：${ctx.displayName}` : ''}
${ctx.tagline ? `- 一句话定位：${ctx.tagline}` : ''}
${ctx.techStack?.length ? `- 技术栈：${ctx.techStack.join('、')}` : ''}
${ctx.features?.length ? `- 核心功能：\n${ctx.features.map((f) => `  - ${f}`).join('\n')}` : ''}
${ctx.entryPoints?.length ? `- 主要入口：${ctx.entryPoints.join('、')}` : ''}
${ctx.requirements ? `- 运行环境：${JSON.stringify(ctx.requirements)}` : ''}
${ctx.extraContext ? `- 补充说明：${ctx.extraContext}` : ''}

# 项目目录结构（节选）
\`\`\`
${(ctx.structure || []).slice(0, 40).join('\n')}
\`\`\`

# 关键源码片段（节选）
${(ctx.sourceSamples || []).slice(0, 6).map((s) => `\n## ${s.path}\n\`\`\`\n${s.content.slice(0, 1200)}\n\`\`\``).join('\n')}

# 输出要求
1. 包含以下章节（按顺序）：
   - 标题 + 徽章（可选，简单纯文本即可）
   - 一句话简介
   - 核心特性（要点列表）
   - 适用场景
   - 快速开始（按技术栈给真实可执行的命令）
   - 安装 / 加载方式（如浏览器扩展写明加载步骤）
   - 使用教程（步骤清晰，可直接照做）
   - 配置说明（如有配置文件）
   - 常见问题 FAQ（3-5 条）
   - 路线图（可选）
   - 贡献指南（简要）
   - 开源协议
2. 不杜撰信息：未给出的具体命令/字段可写"按需修改"，不要瞎编。
3. 使用中文输出。
4. 仅输出 README Markdown 内容，不要任何前言/解释。
`,
  tutorial: (ctx) => `你是一名教学型技术作者，输出**纯 Markdown** 使用教程。

# 任务
为「${ctx.name}」写一份详细的「使用教程」文档，针对第一次接触该项目的用户。

# 项目信息
${JSON.stringify({
  name: ctx.name,
  tagline: ctx.tagline,
  techStack: ctx.techStack,
  features: ctx.features,
  entryPoints: ctx.entryPoints,
}, null, 2)}

# 源码摘要
${(ctx.sourceSamples || []).slice(0, 4).map((s) => `\n## ${s.path}\n\`\`\`\n${s.content.slice(0, 800)}\n\`\`\``).join('\n')}

# 输出要求
1. 章节建议：
   - 前置准备
   - 5 分钟跑起来（最小可用示例）
   - 进阶用法（按功能点拆分小节）
   - 排错指南（按错误现象给思路）
   - 进阶阅读（指向 README / Wiki 等）
2. 步骤必须可执行：每步先讲做什么，再给出具体命令/操作。
3. 用中文、Markdown。
4. 不要前言，直接开始文档。
`,
  changelog: (ctx) => `基于以下变更生成 CHANGELOG.md 初稿（Markdown，Keep a Changelog 格式，中文）：

- 项目：${ctx.name}
- 版本：${ctx.version || '0.1.0'}
- 发布日期：${ctx.date || new Date().toISOString().slice(0, 10)}

如果没有具体变更描述，请按照典型开源项目首版本写：
- Added（核心特性）
- Changed（与上一版相比的改动，未知则省略）
- Fixed（已知问题修复，未知则省略）

只输出 CHANGELOG 内容，不要前言。`,

  // 仅生成本次更新的「条目要点」（不写标题、不写前言），由调用方拼成完整条目。
  changelogEntry: (ctx) => `你是开源项目的更新日志作者。基于本次实际改动，写一段简洁的 CHANGELOG 条目要点。

# 项目
${ctx.name}
# 版本
v${ctx.version || 'x'}

# 本次改动的提交记录
${ctx.commits && ctx.commits.length ? ctx.commits.map((c) => `- ${c}`).join('\n') : '（无提交记录）'}

# 本次改动涉及的文件
${ctx.files && ctx.files.length ? ctx.files.map((f) => `- ${f}`).join('\n') : '（无）'}

# 要求
1. 聚焦「用户能感知的变化」，忽略无关文件与自动生成文件。
2. 每条以 "- " 开头，一行一条；尽量按 新增 / 修复 / 优化 归类（如能判断）。
3. 不要写标题、不要写前言、不要解释。只输出要点本身。`,
};

async function callProvider({ provider, apiKey, baseUrl, model }, messages, opts = {}) {
  if (!apiKey) throw new Error(`${provider} API Key 未配置（运行 opu config set ai.apiKey=xxx）`);
  const url = `${(baseUrl || 'https://api.deepseek.com').replace(/\/$/, '')}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'opu-cli',
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages,
      temperature: opts.temperature || 0.4,
      max_tokens: opts.maxTokens || 4000,
      stream: false,
    }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { body = text; }
  if (!res.ok) {
    const msg = (body && body.error && body.error.message) || `AI 请求失败 (HTTP ${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body.choices?.[0]?.message?.content || '';
}

async function generate(kind, ctx, aiConfig) {
  const promptFn = DEFAULT_PROMPTS[kind];
  if (!promptFn) throw new Error(`未知的 AI 生成类型：${kind}`);
  const content = await callProvider(aiConfig, [
    { role: 'system', content: '你是一名资深的开源项目作者，输出严格遵循用户要求的 Markdown。' },
    { role: 'user', content: promptFn(ctx) },
  ]);
  return content.trim();
}

module.exports = { generate, callProvider, DEFAULT_PROMPTS };
