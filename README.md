# opu

> 开源项目自动化提交程序 — 一键把 WorkBuddy 中开发的项目发布到 GitHub / Gitee

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Platform](https://img.shields.io/badge/platform-GitHub%20%7C%20Gitee-orange)

## 简介

**opu** 是一个开源项目自动化发布工具，帮助你将在 WorkBuddy 中开发完成的项目，通过简单的命令行交互，一键完成 GitHub / Gitee 仓库的创建、README 生成与代码推送。告别繁琐的手动配置，让开源发布像喝水一样简单。

## 核心特性

- **一键发布**：自动完成远程仓库创建、代码提交与推送，同时发布到 GitHub 和 Gitee
- **可视化控制台（GUI）**：内置浏览器界面，`opu gui` 或双击启动器即可点点按钮完成发布，无需记命令
- **智能 README 生成**：基于 `.opu.json` 配置，自动生成专业的 README 文档（支持 AI 增强）
- **项目体检**：内置 `doctor` 命令，检查本地环境与配置是否就绪
- **配置向导**：交互式初始化项目配置，无需手写 JSON
- **模板支持**：内置 CHANGELOG、CONTRIBUTING 等开源标配文档模板
- **WorkBuddy 深度集成**：专为 WorkBuddy 开发流程设计，无缝衔接

## 适用场景

- 在 WorkBuddy 中完成项目开发，需要快速发布到 GitHub / Gitee
- 需要同时维护 GitHub 和 Gitee 双平台仓库
- 希望自动化生成 README 和开源文档
- 批量管理多个开源项目的发布流程

## 快速开始

### 环境要求

- Node.js >= 18
- Git 已安装并配置好全局用户信息
- GitHub / Gitee 账号及对应的 Personal Access Token

### 安装

```bash
# 克隆项目
git clone https://github.com/2657449167/opu.git
cd opu

# 安装依赖
npm install
```

### 启动（命令行）

```bash
node bin/opu.js --help
```

或链接为全局命令后直接用：

```bash
npm link
opu --help
```

## 可视化控制台（GUI）— 推荐给不想敲命令的用户

不想记命令？opu 内置了一个**本地可视化发布控制台**，点点按钮就能完成配置与发布，无需再和助手对话。

**两种启动方式：**

1. **双击启动器**（最简单）：直接双击项目根目录里的
   - `启动可视化发布工具.bat`（中文名，双击即用）
   - 或 `opu-gui.bat`（英文等价）
2. **命令行启动**：

   ```bash
   node bin/opu.js gui      # 启动并自动打开浏览器
   node bin/opu.js gui --no-open   # 不自动打开浏览器，手动访问 http://127.0.0.1:<端口>
   node bin/opu.js gui --port 8080 # 指定端口
   ```

启动后控制台会自动打开浏览器（仅绑定 `127.0.0.1`，本地安全）。界面包含三个模块：

- **发布项目**：选目录 → 自动识别技术栈 → 编辑项目信息 → AI 生成/手动编辑 README 与教程 → 勾选平台一键发布，全程带实时日志。
- **全局配置**：填写 GitHub / Gitee 令牌、DeepSeek Key、著作权归属人；支持「测试连接」即时校验。
- **环境检查**：一键检查 Git、各平台 Token、AI 是否就绪。

> 所有数据仅保存在你本机（`~/.opu/config.json` 与项目内 `.opu.json`），不上传任何服务器。

## 使用教程（命令行）

### 第一步：初始化配置

```bash
opu init
```

按照交互提示，填写项目名称、描述、仓库地址等信息，程序会自动生成 `.opu.json` 配置文件。

### 第二步：环境检查

```bash
opu doctor
```

检查本地 Git 配置、GitHub/Gitee Token 是否有效、Node 版本是否满足要求。

### 第三步：配置平台信息

```bash
opu config
```

配置 GitHub / Gitee 的 owner、repo 信息以及访问 Token（也可用 `opu config set tokens.github <token>` 直接写）。

### 第四步：发布项目

```bash
opu publish
```

程序将自动完成以下操作：

1. 读取 `.opu.json` 配置
2. 生成 README.md 及配套文档
3. 在 GitHub / Gitee 创建远程仓库
4. 初始化 Git 仓库并提交代码
5. 推送到远程仓库

### 同步更新

```bash
opu sync
```

当本地代码有更新时，使用该命令将最新代码同步推送到两个远程仓库。

## 配置说明

项目使用 `.opu.json` 作为配置文件，核心字段说明：

```json
{
  "name": "项目名称（仓库名）",
  "tagline": "一句话定位",
  "description": "详细描述",
  "features": ["特性列表"],
  "techStack": ["技术栈"],
  "license": "开源协议",
  "topics": ["话题标签"],
  "platforms": {
    "github": { "owner": "GitHub用户名", "repo": "仓库名" },
    "gitee": { "owner": "Gitee用户名", "repo": "仓库名" }
  },
  "entryPoints": ["入口命令"],
  "requirements": { "node": ">=18" },
  "ai": {
    "enabled": true,
    "extraContext": "AI 生成 README 时的额外上下文"
  },
  "docs": {
    "readme": "手动指定 README 内容（留空则自动生成）",
    "tutorial": "使用教程原文"
  }
}
```

参考示例：`examples/.opu.json` 和 `examples/auto-video-player.opu.json`。

## 常见问题 FAQ

### Q1: 提示 "GitHub Token 无效" 怎么办？

请确认 Token 具有 `repo` 权限，并在 `config` 命令中正确配置。Token 可以在 GitHub Settings → Developer settings → Personal access tokens 中生成。

### Q2: 发布时提示仓库已存在？

如果远程仓库已存在，opu 会尝试直接推送。若仓库为空且无冲突，推送会成功；如有冲突，请先手动处理或删除远程仓库后重试。

### Q3: 如何只发布到 GitHub 而不发布到 Gitee？

在 `.opu.json` 的 `platforms` 中删除 `gitee` 配置，或在 `config` 命令中跳过 Gitee 设置即可。

### Q4: AI 生成的 README 不满意怎么办？

可以在 `.opu.json` 的 `docs.readme` 字段中手动填写你想要的 README 内容，程序将优先使用手动填写的内容。

### Q5: 支持私有仓库吗？

支持。在 `.opu.json` 的 `platforms` 中为对应平台设置 `"visibility": "private"` 即可。

## 路线图

- [x] 可视化控制台（GUI）— 浏览器界面，点点按钮即可发布
- [x] 自动生成 README / 使用教程 / CHANGELOG
- [x] 内置知识产权归属（LICENSE + NOTICE，禁止移除/冒名署名）
- [ ] 支持更多代码托管平台（GitLab、Bitbucket）
- [ ] 集成 CI/CD 发布流程
- [ ] 支持多项目批量发布

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

开发调试时可设置环境变量 `OPU_DEBUG=1` 查看详细日志。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源，欢迎自由使用和二次开发。