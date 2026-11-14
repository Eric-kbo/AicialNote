<div align="center">

<img src="web/public/favicon.svg" width="72" height="72" alt="AicialNote logo">

# AicialNote

**账号资料和笔记，存在你自己的云盘里。**

开源的账号资料管理工具：账号、密码、2FA、辅助邮箱、代理 IP。<br>
服务器上没有数据库，数据以普通文件的形式保存在你自己的 Google Drive 或 OneDrive 中。

[![官网](https://img.shields.io/badge/官网-aicialnotes.com-3e63dd)](https://aicialnotes.com)
[![许可证: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3e63dd)](LICENSE)
[![CI](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml/badge.svg)](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml)
![状态: Alpha](https://img.shields.io/badge/status-alpha-orange)

**[立即使用：aicialnotes.com](https://aicialnotes.com)** ·
[自己部署](docs/self-hosting.md) ·
[数据格式](docs/data-format.md) ·
[反馈问题](https://github.com/Eric-kbo/AnNote/issues)

[English](README.md) · **简体中文** · [繁體中文](docs/i18n/README.zh-TW.md) · [日本語](docs/i18n/README.ja.md) ·
[한국어](docs/i18n/README.ko.md) · [Español](docs/i18n/README.es.md) · [Deutsch](docs/i18n/README.de.md) ·
[Français](docs/i18n/README.fr.md) · [Português](docs/i18n/README.pt-BR.md) · [Русский](docs/i18n/README.ru.md)

![AicialNote 账号列表](docs/images/list.png)

</div>

## 目录

- [为什么选择 AicialNote](#为什么选择-aicialnote)
- [功能](#功能)
- [开始使用](#开始使用)
- [工作原理](#工作原理)
- [安全说明](#安全说明)
- [开发](#开发)
- [开发计划](#开发计划)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

## 为什么选择 AicialNote

大多数密码管理器把你的数据放在它们的服务器上，而且只能用它们的应用打开。AicialNote 反过来：

- **文件归你所有。** 所有内容以 JSON 保存在**你自己的** Google Drive 或 OneDrive（或本地文件夹）中，旁边自动生成
  Markdown 和 CSV 副本。即使 AicialNote 明天不在了，你仍然可以用任何文本编辑器或 Excel 打开自己的数据。
- **服务器看不到你的数据。** 浏览器直接和 Google、微软通信。那个很小的 Go 服务只负责完成 OAuth 登录，不保存任何内容。
- **数据很难丢。** 每次修改都保留旧版本，删除先进回收站，同步冲突时两边的版本都保留。

> [!WARNING]
> **AicialNote 目前是 Alpha 版本。** 演示模式和本地文件夹已经过充分测试；Google Drive 和 OneDrive 同步还比较新。在它经过你的实际使用验证之前，
> 请定期备份（**导出数据… → 完整备份（JSON）**）。存放真实密码前，请先阅读下面的[安全说明](#安全说明)。

## 功能

- **一个列表管理所有 ID**：每个 ID 下挂多张卡片（Google、Apple ID、Microsoft、OpenAI、Claude、邮箱、网站账号、API 密钥、
  代理 IP、服务器、Wi-Fi、银行卡、收货地址、身份资料、证件、自定义），
  可按状态、标签、卡片类型、即将到期筛选。
- **点击即复制**：任何字段点一下就复制，2FA 字段直接显示当前验证码。
- **智能粘贴**：直接粘贴 `账号 xxx 密码 xxx 辅助邮箱 xxx`、`邮箱----密码----辅助邮箱----2FA`、`ip:端口:用户名:密码`，
  或者上百行这样的内容，自动识别字段，可批量导入。
- **笔记本**：类似 OneNote 的笔记本、分区、页面，带富文本编辑器；账号也可以归档到分区里，和笔记放在一起。
- **本地优先**：读写即时生效，断网也能用，后台自动同步。
- **导入导出**：完整 JSON 备份、CSV 和 Markdown 导出，也可以从 `trash/` 里的副本恢复。
- **键盘优先**：`Ctrl K`、`/`、`J`/`K`、`N`、`Ctrl V`；浅色和深色主题，中英双语界面。

<p align="center">
  <img src="docs/images/detail.png" width="49%" alt="账号详情">
  <img src="docs/images/paste.png" width="49%" alt="智能粘贴">
</p>

## 开始使用

### 使用官方站点

打开 **[aicialnotes.com](https://aicialnotes.com)**，用 Google 或微软账号登录即可，无需安装。网站只会获得它自己创建的文件的权限：

| 存储位置     | 权限                        | AicialNote 能访问的范围                 |
| ------------ | --------------------------- | --------------------------------------- |
| Google Drive | `drive.file`                | 只有 AicialNote 自己创建的文件          |
| OneDrive     | `Files.ReadWrite.AppFolder` | 只有 `应用/AicialNote` 文件夹           |
| 本地文件夹   | 浏览器文件访问              | 只有你选择的文件夹（Chromium 系浏览器） |

### 自己部署

AicialNote 打包成单个二进制文件（或一个容器），前端已内嵌其中。注册 Google 和/或微软的 OAuth 应用，配置 4 个环境变量，运行即可。
详见 [docs/self-hosting.md](docs/self-hosting.md)。

## 工作原理

```text
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

云盘里的文件：

```text
AicialNote/
├── vault.json                设置
├── items/<id>.json           数据本体，每个 ID 一个文件
├── notes/<id>.json           笔记本、分区和页面
├── history/<id>/…            每次修改前的旧版本
├── trash/                    已删除的内容
├── readable/                 自动生成的 Markdown 和 CSV（任何编辑器或 Excel 都能打开）
└── index.json                自动生成的索引
```

云盘上的文件格式是公开、带版本号的约定：[docs/data-format.md](docs/data-format.md)。

## 安全说明

- **AicialNote 目前不会对数据额外加密。** 云盘里的文件和浏览器中的本地缓存（IndexedDB）都是明文，它们的安全取决于你的云盘账号和你的设备，
  请务必为云盘账号开启两步验证。可选的端到端加密在开发计划中。
- **服务器看不到你的数据。** 它只负责完成 OAuth 登录。refresh token 保存在经过 AES-GCM 加密、设置了 HttpOnly 的 Cookie 中；
  服务器没有数据库，不保存任何内容。
- **最小权限。** 见[开始使用](#使用官方站点)中的表格。
- **严格的 CSP。** `script-src 'self'`，`connect-src` 只允许 Google Drive 和 OneDrive 的域名。

发现安全漏洞？请按 [SECURITY.md](SECURITY.md) 的方式私下报告，不要公开提 Issue。

## 开发

需要 Node 22+、pnpm 10+、Go 1.26+。

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev            # 前端 http://localhost:5173
pnpm dev:server     # OAuth 服务 :8080（需要 server/.env，参考 server/.env.example）
```

开发环境的登录页有「打开演示数据」，数据只保存在内存里，开发界面时不需要配置 OAuth。

```sh
pnpm test           # 单元测试（TypeScript + Go）
pnpm typecheck
pnpm lint
pnpm smoke          # 在 Chrome 中跑端到端检查（需先 pnpm dev）
pnpm screenshots    # 截图：浅色 / 深色、中文 / 英文
pnpm build          # 打包成单个二进制：server/bin/aicialnote
```

| 目录               | 内容                                                 |
| ------------------ | ---------------------------------------------------- |
| `packages/core`    | 数据模型、智能粘贴、TOTP、可读导出、数据操作         |
| `packages/storage` | 存储适配器：Google Drive、OneDrive、本地文件夹、内存 |
| `web`              | React 应用：本地缓存、同步引擎、界面                 |
| `server`           | Go：OAuth 中转和静态文件服务                         |
| `docs`             | 数据格式、设计原则、自己部署                         |

项目进度、设计决策和开发注意事项：[docs/status.md](docs/status.md)、[docs/decisions.md](docs/decisions.md)、[CLAUDE.md](CLAUDE.md)。

## 开发计划

- [ ] 可选的端到端加密（文件结构不变，内容加密）
- [ ] 同时镜像到第二个云盘
- [ ] 在设置中自定义模板和状态
- [ ] 从 OneNote / CSV 导入，导出为离线 HTML 查看器
- [ ] 更多界面语言
- [ ] 桌面端和移动端

## 参与贡献

欢迎用中文或英文提 Issue 和 Pull Request，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。比修 bug 更大的改动，请先开 Issue 讨论方案。

## 许可证

AicialNote 是自由软件，基于 **[GNU Affero 通用公共许可证 v3.0（AGPL-3.0）](LICENSE)** 发布。

你可以自由使用、研究、修改和再分发。如果你运行修改后的版本并通过网络提供给他人使用，必须以同样的许可证公开你的源代码。

Copyright © 2026 Eric-kbo
