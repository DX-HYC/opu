'use strict';

/* ===========================================================================
 * 开源项目自动化提交程序 · 可视化控制台 前端逻辑
 * 仅依赖原生 JS，通过 /api/* 与后端通信
 * ========================================================================= */

const $ = (id) => document.getElementById(id);
const api = (path, opts) => fetch(path, opts);

const state = {
  dir: '',
  manifest: null,
  docs: { readme: '', tutorial: '', changelog: '' },
  currentDoc: 'readme',
};

/* -------------------- 通用工具 -------------------- */

function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
}

function setHint(elId, msg, kind = 'info') {
  const el = $(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'hint ' + kind;
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

/* -------------------- 视图切换 -------------------- */

function initNav() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
      if (view === 'doctor') runDoctor();
      if (view === 'config') loadConfig();
    });
  });
  // 显示/隐藏密码
  document.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.toggle);
      if (!input) return;
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      btn.textContent = isPwd ? '隐藏' : '显示';
    });
  });
}

/* -------------------- 发布向导 -------------------- */

function initPublish() {
  $('scanBtn').addEventListener('click', scanDir);
  $('dirInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') scanDir(); });

  $('saveMetaBtn').addEventListener('click', saveMeta);
  $('genDocBtn').addEventListener('click', genDocs);
  $('publishBtn').addEventListener('click', doPublish);

  // 文档 Tab 切换
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      state.currentDoc = tab.dataset.doc;
      $('docArea').value = state.docs[state.currentDoc] || '';
    });
  });
}

function val(id) { return ($(id).value || '').trim(); }

async function scanDir() {
  const dir = $('dirInput').value.trim();
  if (!dir) { setHint('scanInfo', '请先填写项目目录路径', 'warn'); return; }
  state.dir = dir;
  $('scanBtn').disabled = true;
  setHint('scanInfo', '正在扫描项目…', 'info');
  try {
    const r = await postJson('/api/scan', { dir });
    if (r.error) { setHint('scanInfo', '扫描失败：' + r.error, 'error'); return; }
    state.manifest = r.manifest;
    const s = r.scan;
    const tech = (s.techStack || []).join(' / ') || '未识别';
    setHint('scanInfo', `已识别：技术栈 [${tech}] · 文件数 ${s.fileCount} · ${s.hasGit ? '已是 git 仓库' : '将自动初始化 git'}`, 'ok');
    fillMetaForm(r.manifest);
    $('metaCard').style.display = '';
    $('docCard').style.display = '';
    $('runCard').style.display = '';
    await genDocs();
  } catch (e) {
    setHint('scanInfo', '请求出错：' + e.message, 'error');
  } finally {
    $('scanBtn').disabled = false;
  }
}

function fillMetaForm(m) {
  m = m || {};
  const gh = (m.platforms && m.platforms.github) || {};
  const gt = (m.platforms && m.platforms.gitee) || {};
  $('m_displayName').value = m.displayName || '';
  $('m_repo').value = gh.repo || m.name || '';
  $('m_tagline').value = m.tagline || '';
  $('m_license').value = (m.license || 'MIT');
  $('m_ghOwner').value = gh.owner || '';
  $('m_gtOwner').value = gt.owner || '';
  $('m_features').value = (m.features || []).join('\n');
  $('m_topics').value = (m.topics || []).join(', ');
  $('m_useAI').checked = !(m.ai && m.ai.enabled === false);
}

function buildManifest() {
  const m = state.manifest || { name: '', platforms: { github: {}, gitee: {} } };
  const repo = val('m_repo') || m.name || 'repo';
  m.displayName = val('m_displayName');
  m.tagline = val('m_tagline');
  m.license = val('m_license') || 'MIT';
  m.name = m.name || repo;
  m.platforms = m.platforms || {};
  m.platforms.github = Object.assign({}, m.platforms.github, {
    owner: val('m_ghOwner'),
    repo,
    visibility: (m.platforms.github && m.platforms.github.visibility) || 'public',
  });
  m.platforms.gitee = Object.assign({}, m.platforms.gitee, {
    owner: val('m_gtOwner'),
    repo,
    visibility: (m.platforms.gitee && m.platforms.gitee.visibility) || 'public',
  });
  const feats = val('m_features').split('\n').map((s) => s.trim()).filter(Boolean);
  m.features = feats.length ? feats : (m.features || []);
  const tops = val('m_topics').split(',').map((s) => s.trim()).filter(Boolean);
  m.topics = tops.length ? tops : (m.topics || []);
  m.ai = m.ai || {};
  m.ai.enabled = $('m_useAI').checked;
  return m;
}

async function saveMeta() {
  const m = buildManifest();
  state.manifest = m;
  try {
    await postJson('/api/manifest', { dir: state.dir, manifest: m });
    setHint('metaHint', '项目配置 .opu.json 已保存 ✓', 'ok');
  } catch (e) {
    setHint('metaHint', '保存失败：' + e.message, 'error');
  }
}

async function genDocs() {
  if (!state.dir) return;
  const m = buildManifest();
  state.manifest = m;
  try {
    $('genDocBtn').disabled = true;
    const r = await postJson('/api/preview', { dir: state.dir, manifest: m, useAI: $('m_useAI').checked });
    state.docs = { readme: r.readme || '', tutorial: r.tutorial || '', changelog: r.changelog || '' };
    $('docArea').value = state.docs[state.currentDoc] || '';
    toast('文档已生成', 'ok');
  } catch (e) {
    toast('生成文档失败：' + e.message, 'error');
  } finally {
    $('genDocBtn').disabled = false;
  }
}

function collectDocs() {
  // 用当前编辑框的内容覆盖对应 tab 的内容
  state.docs[state.currentDoc] = $('docArea').value;
  return state.docs;
}

async function doPublish() {
  if (!state.dir) { toast('请先选择并扫描项目目录', 'warn'); return; }
  const m = buildManifest();
  state.manifest = m;
  const docs = collectDocs();

  const platforms = [];
  if ($('run_github').checked) platforms.push('github');
  if ($('run_gitee').checked) platforms.push('gitee');
  const platform = platforms.length === 2 ? 'both' : (platforms[0] || 'both');

  const body = {
    dir: state.dir,
    manifest: m,
    platform,
    dryRun: $('run_dryRun').checked,
    useAI: $('m_useAI').checked,
    docs,
    message: 'chore: publish via opu GUI',
  };

  const logBox = $('logBox');
  logBox.style.display = '';
  logBox.innerHTML = '';
  $('resultBox').innerHTML = '';
  $('publishBtn').disabled = true;

  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        const line = part.replace(/^data:\s?/, '').trim();
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch (_) { continue; }
        handlePublishEvent(obj, logBox);
      }
    }
  } catch (e) {
    appendLog(logBox, 'err', '请求失败：' + e.message);
  } finally {
    $('publishBtn').disabled = false;
  }
}

function appendLog(logBox, level, msg) {
  const line = document.createElement('div');
  line.className = 'log-line ' + (level || 'info');
  line.textContent = msg;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function handlePublishEvent(obj, logBox) {
  if (obj.type === 'log') {
    appendLog(logBox, obj.level, obj.msg);
  } else if (obj.type === 'start') {
    appendLog(logBox, 'info', '— 开始发布 —');
  } else if (obj.type === 'done') {
    const results = obj.results || [];
    appendLog(logBox, 'ok', '— 发布流程结束 —');
    renderResults(results);
  } else if (obj.type === 'error') {
    appendLog(logBox, 'err', '错误：' + obj.message);
  }
}

function renderResults(results) {
  const box = $('resultBox');
  box.innerHTML = '';
  if (!results.length) {
    box.innerHTML = '<div class="result empty">没有平台被发布（可能未配置对应 token 或未被勾选）</div>';
    return;
  }
  results.forEach((r) => {
    const el = document.createElement('div');
    el.className = 'result ' + (r.ok ? 'ok' : 'err');
    const title = r.target.toUpperCase();
    if (r.ok && r.url) {
      el.innerHTML = `<div class="result-title">✔ ${title}</div><a href="${r.url}" target="_blank" rel="noopener">${r.url}</a>`;
    } else if (r.ok) {
      el.innerHTML = `<div class="result-title">✔ ${title}</div><div class="result-sub">${r.dryRun ? '演练完成（未实际推送）' : '完成'}</div>`;
    } else {
      el.innerHTML = `<div class="result-title">✘ ${title}</div><div class="result-sub">${r.error || '失败'}</div>`;
    }
    box.appendChild(el);
  });
}

/* -------------------- 全局配置 -------------------- */

async function loadConfig() {
  try {
    const c = await (await fetch('/api/config')).json();
    $('cfg_github').value = c.tokens?.github || '';
    $('cfg_gitee').value = c.tokens?.gitee || '';
    $('cfg_aiKey').value = c.ai?.apiKey || '';
    $('cfg_aiBase').value = c.ai?.baseUrl || 'https://api.deepseek.com';
    $('cfg_aiModel').value = c.ai?.model || 'deepseek-chat';
    $('cfg_holder').value = c.copyright?.holder || '';
    $('cfg_year').value = c.copyright?.year || '';
    setHint('cfgHint', '配置已从本地读取（令牌已脱敏显示）', 'info');
  } catch (e) {
    setHint('cfgHint', '读取配置失败：' + e.message, 'error');
  }
}

function initConfig() {
  $('saveCfgBtn').addEventListener('click', saveConfig);
  document.querySelectorAll('[data-test]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const field = btn.dataset.test;
      const inputId = field === 'tokens.github' ? 'cfg_github' : field === 'tokens.gitee' ? 'cfg_gitee' : 'cfg_aiKey';
      const value = $(inputId).value;
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = '测试中…';
      try {
        const r = await postJson('/api/config/test', {
          field, value,
          baseUrl: $('cfg_aiBase').value,
          model: $('cfg_aiModel').value,
        });
        toast(r.detail || (r.ok ? '连接成功' : '连接失败'), r.ok ? 'ok' : 'error');
      } catch (e) {
        toast('测试失败：' + e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });
  });
}

async function saveConfig() {
  const updates = {
    'tokens.github': $('cfg_github').value,
    'tokens.gitee': $('cfg_gitee').value,
    'ai.apiKey': $('cfg_aiKey').value,
    'ai.baseUrl': $('cfg_aiBase').value,
    'ai.model': $('cfg_aiModel').value,
    'copyright.holder': $('cfg_holder').value,
    'copyright.year': $('cfg_year').value,
  };
  try {
    const r = await postJson('/api/config', { updates });
    setHint('cfgHint', `配置已保存 ✓（${r.changed} 项更新，脱敏值已忽略）`, 'ok');
    toast('配置已保存', 'ok');
  } catch (e) {
    setHint('cfgHint', '保存失败：' + e.message, 'error');
  }
}

/* -------------------- 环境检查 -------------------- */

async function runDoctor() {
  const list = $('doctorList');
  list.innerHTML = '<div class="doc-item pending">检查中…</div>';
  try {
    const r = await (await fetch('/api/doctor')).json();
    const checks = r.checks || [];
    if (!checks.length) { list.innerHTML = '<div class="doc-item">无检查项</div>'; return; }
    list.innerHTML = '';
    checks.forEach((c) => {
      const el = document.createElement('div');
      el.className = 'doc-item ' + (c.ok ? 'ok' : 'err');
      el.innerHTML = `<div class="doc-name">${c.ok ? '✔' : '✘'} ${c.name}</div><div class="doc-detail">${c.detail || ''}</div>`;
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = `<div class="doc-item err">检查失败：${e.message}</div>`;
  }
}

/* -------------------- 启动 -------------------- */

window.addEventListener('DOMContentLoaded', () => {
  initNav();
  initPublish();
  initConfig();
  // 默认加载配置到内存（用于发布时补全）
  loadConfig();
});
