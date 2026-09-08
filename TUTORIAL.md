# opu 使用教程

## 前置准备

在开始使用 opu 之前，请确保你的环境满足以下要求：

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 18 | 建议使用 LTS 版本 |
| npm | >= 9 | 随 Node.js 一起安装 |
| Git | 任意较新版本 | 需要配置好全局用户信息 |

### 安装 opu

```bash
# 全局安装（推荐）
npm install -g opu

# 验证安装
opu --version
```

### 配置 Git 用户信息

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

### 准备远程仓库账号

- **GitHub**：确保你有 GitHub 账号，并配置了 [SSH key](https://docs.github.com/zh/authentication/connecting-to-github-with-ssh) 或 [Personal Access Token](https://github.com/settings/tokens)
- **Gitee**：确保你有 Gitee 账号，并配置了 SSH key 或私人令牌

> **提示**：opu 支持同时发布到 GitHub 和 Gitee，你可以只配置其中一个，也可以两个都配置。

---

## 5 分钟跑起来

下面通过一个最小示例，让你快速体验 opu 的核心功能。

### 第 1 步：初始化项目

假设你有一个项目目录 `my-cool-project`，进入该目录并初始化 opu：

```bash
cd my-cool-project
opu init
```

命令执行后，opu 会在当前目录生成一个 `.opu.json` 配置文件。

### 第 2 步：编辑配置文件

打开 `.opu.json`，修改为以下内容（替换为你自己的信息）：

```json
{
  "name": "my-cool-project",
  "tagline": "这是一个示例项目",
  "description": "这个项目用于演示 opu 的基本用法。",
  "features": ["简单易用", "自动化发布"],
  "techStack": ["JavaScript"],
  "license": "MIT",
  "platforms": {
    "github": {
      "owner": "your-github-username",
      "repo": "my-cool-project"
    },
    "gitee": {
      "owner": "your-gitee-username",
      "repo": "my-cool-project"
    }
  },
  "entryPoints": ["npm start"]
}
```

> **注意**：`owner` 必须是你的用户名（或组织名），`repo` 是远程仓库名称。如果不想发布到某个平台，可以删除对应的配置块。

### 第 3 步：检查环境

运行诊断命令，确保一切就绪：

```bash
opu doctor
```

该命令会检查：
- 配置文件是否有效
- Git 是否已配置
- 远程仓库是否可达

如果所有检查项都通过，你会看到类似 `✔ All checks passed` 的输出。

### 第 4 步：一键发布

```bash
opu publish
```

opu 会自动完成以下操作：

1. 根据 `.opu.json` 自动生成 README.md（如果不存在）
2. 初始化 Git 仓库（如果尚未初始化）
3. 创建远程仓库（GitHub / Gitee）
4. 提交所有代码并推送到远程

### 第 5 步：验证结果

打开浏览器，访问：

- GitHub：`https://github.com/your-github-username/my-cool-project`
- Gitee：`https://gitee.com/your-gitee-username/my-cool-project`

你的项目应该已经成功发布！

---

## 进阶用法

### 1. 多平台同步（`opu sync`）

当你的项目已经发布到 GitHub，但还没有发布到 Gitee（或反之），可以使用同步命令：

```bash
# 将项目同步到所有配置的平台
opu sync

# 指定只同步到 Gitee
opu sync --platform gitee
```

**适用场景**：
- 项目已在 GitHub 上，想同步到 Gitee
- 修改了 `.opu.json` 中的平台配置后，需要重新同步

### 2. 自定义项目目录（`--cwd`）

默认情况下，opu 在当前目录下运行。你可以通过 `--cwd` 参数指定其他目录：

```bash
# 对 /path/to/project 目录执行发布
opu publish --cwd /path/to/project

# 对指定目录执行诊断
opu doctor --cwd /path/to/project
```

### 3. 查看和修改配置（`opu config`）

查看当前配置：

```bash
opu config
```

修改配置项（例如修改 tagline）：

```bash
opu config set tagline "新的项目描述"
```

查看某个具体配置：

```bash
opu config get platforms.github.owner
```

### 4. 使用 AI 自动生成文档

在 `.opu.json` 中启用 AI 功能：

```json
{
  "ai": {
    "enabled": true,
    "extraContext": "这个项目使用了特殊的 WebSocket 协议，需要在 README 中特别说明。"
  }
}
```

启用后，运行 `opu publish` 时，opu 会自动：

- 根据 `tagline`、`description`、`features` 等信息生成 README.md
- 将 `extraContext` 中的额外说明注入到 AI 的上下文中，生成更准确的文档

> **注意**：AI 功能需要网络连接。如果 AI 不可用，opu 会回退到使用 `docs.readme` 字段中的内容（如果配置了的话）。

### 5. 手动指定 README 内容

如果你不想依赖 AI 生成，可以提前在 `.opu.json` 中配置好 README 内容：

```json
{
  "docs": {
    "readme": "# 我的项目\n\n这是手动编写的 README 内容，不会被 AI 覆盖。"
  }
}
```

### 6. 配置仓库可见性

你可以在 `.opu.json` 中指定仓库的可见性：

```json
{
  "platforms": {
    "github": {
      "owner": "your-name",
      "repo": "my-cool-project",
      "visibility": "private"
    }
  }
}
```

可选值：`public`（默认）、`private`。

### 7. 使用示例配置作为模板

opu 提供了两个示例配置文件，可以参考：

```bash
# 查看基础示例
cat node_modules/opu/examples/.opu.json

# 查看完整示例（包含更多字段）
cat node_modules/opu/examples/auto-video-player.opu.json
```

---

## 排错指南

### 错误 1：`command not found: opu`

**现象**：运行 `opu` 命令时提示找不到命令。

**解决方案**：

```bash
# 检查是否安装成功
npm list -g opu

# 如果未安装，重新安装
npm install -g opu

# 如果已安装但仍然找不到，检查 npm 全局 bin 目录是否在 PATH 中
npm bin -g
```

### 错误 2：`Authentication failed` 或 `Permission denied`

**现象**：发布时提示认证失败。

**解决方案**：

1. **检查 SSH key**：
   ```bash
   # 测试 GitHub 连接
   ssh -T git@github.com
   
   # 测试 Gitee 连接
   ssh -T git@gitee.com
   ```

2. **如果 SSH 不行，改用 HTTPS + Token**：
   ```bash
   # 在 GitHub 生成 Personal Access Token（需要 repo 权限）
   # 然后在推送时使用 token 作为密码
   git remote set-url origin https://<username>:<token>@github.com/<owner>/<repo>.git
   ```

### 错误 3：`Repository already exists`

**现象**：发布时提示远程仓库已存在。

**解决方案**：

```bash
# 方案一：使用 sync 命令同步到已存在的仓库
opu sync

# 方案二：手动检查远程仓库地址
git remote -v

# 方案三：如果确认仓库地址正确，直接推送
git push -u origin main
```

### 错误 4：`Invalid .opu.json` 或配置解析失败

**现象**：运行 `opu doctor` 时提示配置文件格式错误。

**解决方案**：

1. **检查 JSON 格式**：
   ```bash
   # 使用 Node.js 验证 JSON 格式
   node -e "JSON.parse(require('fs').readFileSync('.opu.json', 'utf8'))"
   ```

2. **确保必填字段完整**：
   - `name`：项目名称
   - `platforms`：至少配置一个平台

3. **使用 init 重新生成**：
   ```bash
   # 备份当前配置后重新初始化
   mv .opu.json .opu.json.bak
   opu init
   ```

### 错误 5：`README.md already exists`

**现象**：发布时提示 README.md 已存在，AI 不会覆盖。

**解决方案**：

```bash
# 方案一：删除现有 README，让 opu 重新生成
rm README.md
opu publish

# 方案二：在 .opu.json 中设置 docs.readme 字段
# 这样 opu 会使用你提供的内容
```

### 错误 6：`Node.js version not satisfied`

**现象**：提示 Node.js 版本不满足要求。

**解决方案**：

```bash
# 检查当前 Node.js 版本
node --version

# 使用 nvm 切换版本（推荐）
nvm install 18
nvm use 18

# 或者使用 n 工具
sudo n 18
```

### 错误 7：`Git not initialized`

**现象**：提示 Git 仓库未初始化。

**解决方案**：

```bash
# 手动初始化 Git 仓库
git init

# 配置用户信息（如果尚未配置）
git config user.name "你的名字"
git config user.email "你的邮箱"

# 重新运行 opu publish
opu publish
```

### 错误 8：`Network timeout` 或连接超时

**现象**：操作 GitHub 或 Gitee 时网络超时。

**解决方案**：

```bash
# 方案一：检查网络连接
ping github.com
ping gitee.com

# 方案二：配置代理（如果使用代理）
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 方案三：增加 Git 超时时间
git config --global http.lowSpeedLimit 1000
git config --global http.lowSpeedTime 60
```

---

## 进阶阅读

- **项目主页**：访问 [GitHub 仓库](https://github.com/2657449167/opu) 获取最新版本和更新日志
- **README**：查看项目的 [README.md](https://github.com/2657449167/opu/blob/main/README.md) 了解项目概览
- **Changelog**：在仓库的 `CHANGELOG.md` 中查看版本更新历史
- **示例项目**：参考 [auto-video-player 示例配置](https://github.com/2657449167/auto-video-player) 了解一个真实项目的完整配置
- **WorkBuddy 集成**：opu 是 WorkBuddy 生态的一部分，了解更多 WorkBuddy 功能请访问 WorkBuddy 官方文档

---

> **提示**：如果在使用过程中遇到其他问题，欢迎在 [GitHub Issues](https://github.com/2657449167/opu/issues) 中提出。