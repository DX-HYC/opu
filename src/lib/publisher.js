'use strict';

/**
 * 发布核心逻辑（CLI 与 GUI 共用）
 *
 * 设计：
 *  - 不依赖任何终端 UI（不调用 chalk / inquirer / ora）
 *  - 通过 opts.onLog(level, msg) 回调上报进度，调用方可自由接终端或浏览器 SSE
 *  - 不弹任何交互式确认，是否确认完全由调用方在调用前决定
 *
 * 阶段：
 *  1. 读取 .opu.json + scan
 *  2. 检查 git
 *  3. 预解析目标平台：owner/repo、是否「同一项目已存在」（更新模式 vs 新建）
 *  4. AI 生成 README / 使用教程（可关闭，可传入 docsOverride 直接用用户编辑的版本）
 *  5. CHANGELOG：基于「上次发布以来的改动」追加一条，绝不覆盖历史
 *  6. 写入仓库（git commit）+ 著作权归属文件（LICENSE / NOTICE）
 *  7. 推送：已存在 → 原地更新默认分支（不新建分支）；不存在 → 新建并设置默认分支
 *  8. 记录 lastPublished（sha/版本/日期）到 .opu.json，供下次 diff
 */

const path = require('path');
const fs = require('fs');
const cfg = require('./config');
const manifest = require('./manifest');
const git = require('./git');
const github = require('./github');
const gitee = require('./gitee');
const ai = require('./ai');
const scanner = require('./scanner');
const tpl = require('./templates');
const notice = require('./notice');
const licenseTexts = require('../commands/license_texts');
const apiUpload = require('./apiUpload');
const changelog = require('./changelog');

async function runPublish(opts) {
  const cwd = path.resolve(opts.cwd || process.cwd());
  const platform = opts.platform || 'both';
  const dryRun = !!opts.dryRun;
  const useAI = opts.useAI !== false;
  const message = opts.message || 'chore: publish via opu';
  const onLog = opts.onLog || (() => {});
  const L = (level, msg) => onLog(level, msg);

  // 1) 加载 manifest
  if (!manifest.exists(cwd)) {
    throw new Error(`未找到 ${manifest.FILENAME}，请先在「发布」页选择目录并保存项目配置`);
  }
  let m = manifest.read(cwd);
  m = manifest.fillDefaults(m, {});

  L('info', `项目：${m.name}${m.tagline ? ' — ' + m.tagline : ''}`);
  L('info', `目标平台：${platform}${dryRun ? '（演练模式）' : ''}`);

  // 2) 全局配置
  const globalCfg = cfg.readAll();
  const aiEnabled = useAI && m.ai?.enabled !== false;
  const aiCfg = globalCfg.ai;

  // 3) git 健康
  const gitAvail = await git.isGitAvailable();
  if (!gitAvail) {
    throw new Error('系统未安装 git 或不在 PATH 中');
  }
  const sCheck = await git.status(cwd);
  if (!sCheck.isRepo) {
    if (!dryRun) {
      await git.initRepo(cwd);
      L('info', '已初始化本地 git 仓库');
    }
  }

  // 4) 扫描补充上下文
  const scan = await scanner.scan(cwd, { maxDepth: 3 });
  const ctx = {
    name: m.displayName || m.name,
    displayName: m.displayName,
    tagline: m.tagline,
    techStack: m.techStack || scan.techStack,
    features: m.features || [],
    entryPoints: m.entryPoints || scan.entryPoints || [],
    requirements: m.requirements || {},
    extraContext: m.ai?.extraContext || '',
    structure: scan.structure,
    sourceSamples: scan.sourceSamples,
  };

  // 4.5) 预解析每个目标平台：owner/repo、是否「同一项目已存在」
  //      —— 决定「更新模式（原地更新）」还是「新建模式」，并自动修正失效的 owner。
  const targets = [];
  if (platform === 'both' || platform === 'github') {
    if (globalCfg.tokens.github) targets.push('github');
    else L('warn', '未配置 GitHub token，跳过 GitHub');
  }
  if (platform === 'both' || platform === 'gitee') {
    if (globalCfg.tokens.gitee) targets.push('gitee');
    else L('warn', '未配置 Gitee token，跳过 Gitee');
  }

  const isGitRepo = sCheck.isRepo;
  const currentHead = isGitRepo ? await git.revParse(cwd, 'HEAD') : null;
  const oldLast = m.lastPublished && m.lastPublished.sha ? m.lastPublished : null;

  const targetInfo = {};
  for (const target of targets) {
    const api = target === 'github' ? github : gitee;
    const token = globalCfg.tokens[target];
    const pc = (m.platforms && m.platforms[target]) || {};
    let owner = pc.owner || '';
    let repo = pc.repo || m.name;
    let isUpdate = false;

    if (!dryRun && token) {
      try {
        const me = await api.whoami(token);
        const meLogin = me.login;
        if (!owner) owner = meLogin;
        let meta = await api.repoExists(token, owner, repo);
        // owner 可能写错（如数字 ID 被重定向）：用真实登录名再试一次
        if (!meta && pc.owner && pc.owner !== meLogin) {
          const alt = await api.repoExists(token, meLogin, repo);
          if (alt) { meta = alt; owner = meLogin; }
        }
        isUpdate = !!meta;
        if (meta && pc.owner && pc.owner !== owner) {
          m.platforms[target].owner = owner; // 就地修正，稍后随 .opu.json 落盘
          L('warn', `[${target}] 已自动修正 owner 为真实登录名 ${owner}`);
        }
      } catch (e) {
        L('warn', `[${target}] 无法预检仓库状态：${e.message}`);
      }
    }

    targetInfo[target] = { owner, repo, isUpdate };
    if (isUpdate) L('info', `[${target}] 检测到已存在仓库 → 更新模式（原地更新，不新建）`);
    else L('info', `[${target}] 未检测到仓库 → 将创建新仓库`);
  }

  // baseline：优先用上次发布的 commit；否则若任一平台已存在则用当前本地 HEAD（=上次发布状态）；否则 null（初始）
  let baselineSha;
  if (oldLast && oldLast.sha) {
    baselineSha = oldLast.sha;
  } else if (targets.some((t) => targetInfo[t] && targetInfo[t].isUpdate)) {
    baselineSha = currentHead;
  } else {
    baselineSha = null;
  }
  const forceInitial = !oldLast;
  const dateStr = new Date().toISOString().slice(0, 10);

  // 5) 生成 README / 使用教程
  L('info', '📝 文档生成阶段');
  let readme = '';
  let tutorial = '';

  const docsOverride = opts.docsOverride || {};

  if (docsOverride.readme && docsOverride.readme.trim()) {
    readme = docsOverride.readme;
    L('ok', '使用您编辑的 README');
  } else if (m.docs?.readme && m.docs.readme.trim()) {
    readme = m.docs.readme;
    L('ok', '使用 manifest.docs.readme 预生成内容（跳过 AI）');
  } else if (aiEnabled && aiCfg?.apiKey) {
    L('info', 'AI 生成 README…');
    try {
      readme = await ai.generate('readme', ctx, aiCfg);
      L('ok', `README 已生成（${readme.length} 字符）`);
    } catch (err) {
      readme = tpl.fallbackReadme(m);
      L('warn', `AI 生成 README 失败：${err.message}，回退模板`);
    }
  } else {
    readme = tpl.fallbackReadme(m);
    L('info', 'AI 未启用，使用内置模板生成 README');
  }

  if (docsOverride.tutorial && docsOverride.tutorial.trim()) {
    tutorial = docsOverride.tutorial;
  } else if (m.docs?.tutorial && m.docs.tutorial.trim()) {
    tutorial = m.docs.tutorial;
  } else if (aiEnabled && aiCfg?.apiKey) {
    try {
      tutorial = await ai.generate('tutorial', ctx, aiCfg);
    } catch (err) {
      tutorial = tpl.fallbackTutorial(m);
    }
  } else {
    tutorial = tpl.fallbackTutorial(m);
  }

  // 5b) CHANGELOG：追加本次更新条目（绝不覆盖历史）
  L('info', '📝 更新日志（CHANGELOG）处理');
  const version = changelog.detectVersion(cwd);
  const summary = changelog.computeChangeSummary(cwd, baselineSha);
  const hasChanges = forceInitial || summary.hasChanges;
  let changelogAppended = false;

  if (hasChanges && !dryRun) {
    let body = '';
    if (docsOverride.changelog && docsOverride.changelog.trim()) {
      body = docsOverride.changelog;
    } else if (aiEnabled && aiCfg?.apiKey) {
      try {
        body = await ai.generate('changelogEntry', {
          name: m.displayName || m.name,
          version,
          date: dateStr,
          commits: summary.commits,
          files: summary.files,
        }, aiCfg);
        L('ok', 'AI 已根据本次改动生成更新日志条目');
      } catch (err) {
        body = '';
        L('warn', `AI 生成更新日志条目失败：${err.message}，改用确定性摘要`);
      }
    }
    if (!body.trim()) {
      const bullets = [];
      if (summary.commits.length) {
        bullets.push(...summary.commits.map((c) => `- ${c.replace(/^[0-9a-f]+\s+/i, '')}`));
      } else if (summary.files.length) {
        bullets.push(...summary.files.map((f) => `- 更新文件：${f}`));
      } else if (forceInitial && (m.features || []).length) {
        bullets.push(...m.features.map((f) => `- ${f}`));
      } else {
        bullets.push('- 更新与优化');
      }
      body = bullets.join('\n');
    }
    const entry = changelog.buildEntry({ version, date: dateStr, body });
    changelogAppended = changelog.appendChangelog(cwd, entry);
    if (changelogAppended) {
      const hdr = (entry.match(/^##\s+(.+)$/m) || [])[1] || '';
      L('ok', `CHANGELOG 已追加条目 ${hdr}`);
    } else {
      L('info', 'CHANGELOG 顶部已存在相同条目，跳过');
    }
  } else if (!hasChanges) {
    L('info', '本次无代码变更，跳过 CHANGELOG 更新（保留历史）');
  }

  // 6) 著作权归属信息（应用到所有通过 opu 发布的项目）
  const copyrightCfg = globalCfg.copyright || {};
  const attributionCtx = {
    holder: copyrightCfg.holder
      || m.platforms?.gitee?.owner
      || m.platforms?.github?.owner
      || '版权所有人',
    year: copyrightCfg.year || '',
    email: copyrightCfg.email || '',
    license: m.license || globalCfg.defaults?.license || 'MIT',
    aliases: [m.platforms?.gitee?.owner, m.platforms?.github?.owner].filter(Boolean),
  };

  // 7) 写入仓库文件（注意：CHANGELOG 已在上一步追加写入，此处不再覆盖）
  if (dryRun) {
    L('dim', '(演练) 不写入磁盘，仅展示预览');
  } else {
    fs.writeFileSync(path.join(cwd, 'README.md'), readme, 'utf8');
    fs.writeFileSync(path.join(cwd, 'TUTORIAL.md'), tutorial, 'utf8');
    const attr = ensureAttribution(cwd, attributionCtx);
    const extra = attr.notice ? ' / NOTICE（著作权声明）' : '';
    L('ok', `README.md / TUTORIAL.md / LICENSE${extra} 已就位${changelogAppended ? ' / CHANGELOG.md 已更新' : ''}`);
  }

  // 8) commit
  let commitResult = { committed: false };
  if (!dryRun) {
    const ghOwner = m.platforms?.github?.owner;
    const giteeOwner = m.platforms?.gitee?.owner;
    const fbName = ghOwner || giteeOwner || m.name || 'opu-publisher';
    const fbEmail = ghOwner
      ? `${ghOwner}@users.noreply.github.com`
      : (giteeOwner ? `${giteeOwner}@users.noreply.gitee.com` : 'publisher@opu.local');
    await git.ensureIdentity(cwd, { name: fbName, email: fbEmail });
    commitResult = await git.commitAll(cwd, message);
    if (commitResult.committed) L('ok', 'git commit 完成');
    else L('info', '无新增内容，跳过 commit');

    // 8.5) 记录本次发布状态（供下次 diff）并折入同一次提交
    if (commitResult.committed) {
      const newHead = await git.revParse(cwd, 'HEAD');
      if (newHead) {
        m.lastPublished = {
          version: version || (m.lastPublished && m.lastPublished.version) || '0.0.0',
          sha: newHead,
          date: dateStr,
        };
        manifest.write(cwd, m);
        try {
          await git.rawAdd(cwd, '.');
          await git.rawCommit(cwd, '--amend', '--no-edit');
        } catch (_) { /* 非关键：lastPublished 仍已落在磁盘 */ }
      }
    }
  } else {
    L('dim', '(演练) 跳过 git commit');
  }

  // 9) 创建 + 推送
  const results = [];
  for (const target of targets) {
    try {
      const res = await publishToTarget(cwd, m, target, globalCfg, { dryRun, info: targetInfo[target] });
      results.push(res);
      L('ok', `[${target}] ${res.url || '(已存在/无变更)'}`);
    } catch (err) {
      L('err', `[${target}] 发布失败：${err.message}`);
      results.push({ target, ok: false, error: err.message });
    }
  }

  return { results, cwd };
}

async function publishToTarget(cwd, manifestData, target, globalCfg, { dryRun, info }) {
  const isGH = target === 'github';
  const api = isGH ? github : gitee;
  const token = isGH ? globalCfg.tokens.github : globalCfg.tokens.gitee;

  const owner = info.owner;
  const repo = info.repo;
  const isUpdate = !!info.isUpdate;

  const platformCfg = manifestData.platforms[target] || {};
  platformCfg.owner = owner;
  platformCfg.repo = repo;

  if (dryRun) {
    const displayOwner = owner || '<owner>';
    return { target, ok: true, url: `https://${isGH ? 'github.com' : 'gitee.com'}/${displayOwner}/${repo}`, dryRun: true };
  }

  // 仓库是否存在（更新模式直接用预检结果，避免重复查询）
  let repoMeta = isUpdate ? await api.repoExists(token, owner, repo) : null;
  if (!repoMeta) {
    try {
      repoMeta = await api.createRepo(token, {
        repo,
        description: manifestData.tagline || manifestData.description?.slice(0, 200) || '',
        homepage: manifestData.homepage || '',
        visibility: platformCfg.visibility || globalCfg.defaults?.visibility || 'public',
        license: mapLicenseFor(target, manifestData.license),
      });
    } catch (err) {
      if (/not accessible by personal access token|403/i.test(err.message) && isGH) {
        throw new Error(
          'GitHub 细粒度令牌无法创建仓库（403 Resource not accessible）。请逐项核对（缺一不可）：\n' +
          '  ① 编辑该令牌（github.com/settings/tokens → Fine-grained tokens → 点进去 → Edit）\n' +
          '  ② Repository access 必须设为「All repositories」（仅选部分仓库仍会 403，这是最易漏的一步）\n' +
          '  ③ Account permissions → Repository creation 设为 Read and write\n' +
          '  ④ Account permissions → Contents 设为 Read and write（推送提交需要）\n' +
          '  ⑤ 滚到底点「Update token」真正保存（很多人改完没点这个，等于没改）\n' +
          '  ⑥ 确认编辑的就是 opu 里这一串令牌（前缀 github_pat_1thsLGq…）。\n' +
          '省事方案：改用经典令牌 —— github.com/settings/tokens → Tokens (classic) → 勾选 repo 一组 → Generate，再用「opu config set tokens.github ghp_xxx」替换即可。'
        );
      } else if (/not accessible by personal access token|403/i.test(err.message) && !isGH) {
        throw new Error('Gitee 令牌需在「私人令牌」勾选 projects 的读写权限。');
      }
      throw err;
    }
  }

  // 解析推送分支：
  //  - 更新模式 → 推送到仓库「已有默认分支」（原地更新，绝不新建分支）
  //  - 新建模式 → 用本地当前分支，并在建仓后把它设为默认分支
  const localBranch = (await git.currentBranch(cwd)) || 'main';
  const pushBranch = isUpdate ? (repoMeta.default_branch || localBranch) : localBranch;

  const cleanUrl = isGH ? `https://github.com/${owner}/${repo}.git`
                        : `https://gitee.com/${owner}/${repo}.git`;
  const authUrl = isGH ? `https://${owner}:${token}@github.com/${owner}/${repo}.git`
                       : `https://oauth2:${token}@gitee.com/${owner}/${repo}.git`;
  await git.addRemote(cwd, target, cleanUrl);

  // 推送（失败时退化为 --force-with-lease；GitHub 仍失败则降级为 Contents API 上传）
  let usedApiUpload = false;
  try {
    await git.pushRefspec(cwd, authUrl, `HEAD:refs/heads/${pushBranch}`);
    await git.setUpstream(cwd, target, pushBranch);
  } catch (err) {
    try {
      await git.pushRefspec(cwd, authUrl, `HEAD:refs/heads/${pushBranch}`, ['--force-with-lease']);
      await git.setUpstream(cwd, target, pushBranch);
    } catch (err2) {
      const isProxyIssue = /502|CONNECT tunnel|proxy|Could not resolve|Could not connect|timed out|ECONNREFUSED|Failed to connect|Connection was reset|Recv failure|reset by peer|ECONNRESET/i.test(err2.message);
      if (isGH && isProxyIssue) {
        console.warn('⚠ git push 因网络/代理失败，自动降级为 GitHub API 上传文件模式…');
        try {
          const res = await apiUpload.uploadRepoViaApi({
            owner, repo, token, cwd,
            message: manifestData.tagline || 'Publish via opu',
            onProgress: (rel, n, total) => console.log(`  (${n}/${total}) ${rel}`),
          });
          console.log(`✔ 已通过 GitHub API 上传 ${res.uploaded} 个文件到 ${res.branch} 分支`);
          usedApiUpload = true;
        } catch (apiErr) {
          throw new Error(
            `git push 与 API 上传均失败。\n  git: ${err2.message}\n  API: ${apiErr.message}\n` +
            '请排查网络/代理：你的环境直连 github 不通，且代理(HTTP_PROXY 指向的本地端口)对 git 的 CONNECT 隧道返回 502。' +
            '请确认代理/VPN 已连上可访问 GitHub 的节点，或换一个能稳定访问 GitHub 的代理后重跑。'
          );
        }
      } else {
        throw new Error(`推送到 ${target} 失败：${err2.message}` + (isGH ? '（请检查令牌权限或仓库是否已存在冲突分支）' : ''));
      }
    }
  }

  // 新建仓库：确保默认分支与我们推送的分支一致
  if (!isUpdate && repoMeta.default_branch && pushBranch !== repoMeta.default_branch) {
    try { await api.setDefaultBranch(token, owner, repo, pushBranch); } catch (_) { /* 非关键 */ }
  }

  // 设置元数据
  if (manifestData.tagline) {
    try {
      await api.setDescription(token, owner, repo, manifestData.tagline);
    } catch (err) { /* 非关键 */ }
  }
  if (manifestData.topics && manifestData.topics.length) {
    try {
      if (isGH) await github.setTopics(token, owner, repo, manifestData.topics);
      else await gitee.setTopics(token, owner, repo, manifestData.topics);
    } catch (err) { /* 非关键 */ }
  }

  const htmlUrl = isGH ? `https://github.com/${owner}/${repo}` : `https://gitee.com/${owner}/${repo}`;
  return { target, ok: true, url: htmlUrl, created: !isUpdate, updated: isUpdate, pushBranch };
}

function mapLicenseFor(target, license) {
  if (!license) return target === 'gitee' ? 'MIT-license' : 'mit';
  if (target === 'gitee') {
    const map = {
      'MIT': 'MIT-license',
      'Apache-2.0': 'Apache-2.0-license',
      'GPL-3.0': 'GPL-3.0-license',
      'BSD-3-Clause': 'BSD-3-Clause-license',
      'MPL-2.0': 'MPL-2.0-license',
      'Unlicense': 'Unlicense-license',
    };
    return map[license] || 'MIT-license';
  }
  return license;
}

function ensureAttribution(cwd, ctx) {
  const result = { license: false, notice: false };
  const licenseKey = ctx.license || 'MIT';

  // LICENSE：缺失，或仍是 opu 自动生成的 MIT 占位文本（无著作权人）时，重新写入带署名的版本
  const licTarget = path.join(cwd, 'LICENSE');
  const isAutoMit = (() => {
    try {
      return fs.readFileSync(licTarget, 'utf8').includes('Permission is hereby granted, free of charge');
    } catch (_) { return false; }
  })();
  if (!fs.existsSync(licTarget) || isAutoMit) {
    const fullText = licenseTexts(licenseKey, ctx);
    fs.writeFileSync(licTarget, fullText, 'utf8');
    result.license = true;
  }

  // NOTICE：知识产权与著作权声明（每次都刷新，保证归属信息最新）
  const noticeTarget = path.join(cwd, 'NOTICE');
  fs.writeFileSync(noticeTarget, notice.buildNotice(ctx), 'utf8');
  result.notice = true;

  return result;
}

module.exports = { runPublish };
