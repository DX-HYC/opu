'use strict';

/**
 * opu init — 在当前/指定目录初始化 .opu.json
 *  - 扫描源码
 *  - 读 WorkBuddy 索引（若配置/可发现）
 *  - 交互问答
 *  - 写入项目 manifest
 */

const path = require('path');
const ui = require('../lib/ui');
const scanner = require('../lib/scanner');
const manifest = require('../lib/manifest');
const workbuddy = require('../lib/workbuddy');

module.exports = async function init({ program, pkg: _pkg }) {
  program
    .command('init [dir]')
    .alias('i')
    .description('初始化项目元数据（生成 .opu.json）')
    .option('--name <name>', '项目名')
    .option('--no-interactive', '非交互模式，使用默认值')
    .option('--from-workbuddy', '尝试从 WorkBuddy 索引里加载上下文')
    .action(async (dir, opts) => {
      const cwd = path.resolve(dir || process.cwd());
      const prompt = require('inquirer').prompt;
      try {
        console.log(ui.header('opu init — 初始化项目元数据'));
        console.log(ui.info(`项目目录：${cwd}`));

        // 0) 可选：从 WorkBuddy 索引里挑出关联项目
        let wbPick = null;
        if (opts.fromWorkbuddy) {
          const candidates = await workbuddy.listAll(cwd);
          if (candidates.length) {
            wbPick = candidates.find((c) => c.path === cwd) || candidates[0];
            console.log(ui.info(`WorkBuddy 索引匹配：${wbPick.name}（${wbPick.path}）`));
          }
        }

        // 1) 扫描源码
        const spin = ui.spinner('扫描项目结构…').start();
        const scanResult = await scanner.scan(cwd, { maxDepth: 4 });
        spin.succeed(`扫描完成：识别到 ${scanResult.techStack.length} 个技术栈关键词、${scanResult.sourceSamples.length} 个源码文件`);

        if (scanResult.techStack.length) {
          console.log(ui.dim(`  技术栈：${scanResult.techStack.join(' / ')}`));
        }

        // 2) 载入/初始化 manifest
        let m = manifest.read(cwd) || manifest.empty(opts.name || scanResult.name, cwd);
        m = manifest.fillDefaults(m, scanResult);

        // 2.1) 针对浏览器扩展自动补 entryPoints（如 auto-video-player）
        if (
          scanResult.techStack.includes('Browser Extension') &&
          (!m.entryPoints || m.entryPoints.length === 0)
        ) {
          m.entryPoints = [
            '打开浏览器扩展管理页（chrome://extensions 或 edge://extensions）',
            '开启右上角「开发者模式」',
            '点击「加载已解压的扩展程序」，选择本项目根目录',
            '在目标学习平台打开课件，扩展会自动接管视频播放',
          ];
          if (!m.features || m.features.length === 0) {
            m.features = [
              '自动恢复暂停的视频播放',
              '自动跳转到下一个视频实现连播',
              '读取进度条数据（currentTime / duration）',
            ];
          }
        }

        if (opts.name) m.name = opts.name;

        // 3) 交互问答
        if (!opts.interactive) {
          // 走最小：保证字段齐
          if (!m.license) m.license = 'MIT';
          if (!m.platforms) m.platforms = { github: { owner: '', repo: m.name }, gitee: { owner: '', repo: m.name } };
        } else {
          const ans = await prompt([
            { type: 'input', name: 'displayName', message: '显示名称（仓库标题）', default: m.displayName || m.name },
            { type: 'input', name: 'tagline', message: '一句话定位', default: m.tagline || '' },
            { type: 'editor', name: 'description', message: '项目详细描述（多行）', default: m.description || '' },
            { type: 'input', name: 'features', message: '核心特性（多条用逗号分隔）', default: (m.features || []).join(','), filter: (s) => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean) },
            { type: 'input', name: 'topics', message: 'GitHub Topics（逗号分隔）', default: (m.topics || []).join(','), filter: (s) => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean) },
            { type: 'list', name: 'license', message: '开源协议', default: m.license || 'MIT', choices: ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'MPL-2.0', 'Unlicense'] },
            { type: 'input', name: 'ghOwner', message: 'GitHub 用户/组织', default: m.platforms?.github?.owner || '' },
            { type: 'input', name: 'ghRepo', message: 'GitHub 仓库名', default: m.platforms?.github?.repo || m.name },
            { type: 'input', name: 'gtOwner', message: 'Gitee 用户/组织（按回车跳过）', default: m.platforms?.gitee?.owner || '' },
            { type: 'input', name: 'gtRepo', message: 'Gitee 仓库名', default: m.platforms?.gitee?.repo || m.name },
            { type: 'confirm', name: 'aiEnabled', message: '是否启用 AI 自动生成 README / 教程？', default: m.ai?.enabled !== false },
          ]);
          m.displayName = ans.displayName;
          m.tagline = ans.tagline;
          m.description = ans.description;
          m.features = ans.features;
          m.topics = ans.topics;
          m.license = ans.license;
          m.platforms = {
            github: { owner: ans.ghOwner, repo: ans.ghRepo, visibility: 'public' },
            gitee:  { owner: ans.gtOwner, repo: ans.gtRepo, visibility: 'public' },
          };
          m.ai = { enabled: ans.aiEnabled, extraContext: m.ai?.extraContext || '' };
        }

        manifest.write(cwd, m);
        console.log(ui.ok(`已写入 ${manifest.FILENAME}`));

        if (wbPick) {
          console.log(ui.dim(`提示：检测到该目录曾出现在 WorkBuddy 索引（来源：${wbPick.source}）`));
        }

        console.log(ui.info('下一步：'));
        console.log(`  ${ui.cyan('opu doctor')}   检查 token / git / AI 配置`);
        console.log(`  ${ui.cyan('opu publish')}  一键发布到 GitHub + Gitee`);
      } catch (err) {
        console.error(ui.err(err.message));
        if (process.env.OPU_DEBUG) console.error(err.stack);
        process.exit(1);
      }
    });
};
