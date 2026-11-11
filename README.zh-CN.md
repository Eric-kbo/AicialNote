# AicialNote

**账号资料，存在你自己的云盘里。**

AicialNote 是一个开源的账号资料管理工具：账号、密码、2FA 密钥、辅助邮箱、代理 IP，以及每个身份需要记录的任何信息。
它不在服务器上保存任何数据。所有内容以 JSON、Markdown、CSV 文件存放在**你自己的** Google Drive 或 OneDrive 中。
即使 AicialNote 不再可用，数据也完整可读。

> **当前状态：Alpha。** 演示模式和本地文件夹已经过充分测试；Google Drive 和 OneDrive 同步还比较新。在它经过你的实际使用验证之前，
> 请定期备份（**导出数据… → 完整备份（JSON）**）。存放真实密码前，请先阅读下面的[安全说明](#安全说明)。

[English](README.md)

![列表](docs/images/list.png)

## 功能

- **一个列表管理所有 ID**：每个 ID 下挂多张卡片（Google、Apple ID、Microsoft、邮箱、代理 IP、网站账号、身份资料、自定义），
  可按状态、标签、卡片类型、即将到期筛选。
- **点击即复制**：任何字段点一下就复制，2FA 字段直接显示当前验证码。
- **智能粘贴**：直接粘贴 `账号 xxx 密码 xxx 辅助邮箱 xxx`、`邮箱----密码----辅助邮箱----2FA`、`ip:端口:用户名:密码`，
  或者上百行这样的内容，自动识别字段，可批量导入。
- **本地优先**：读写即时生效，断网也能用，后台自动同步。
- **数据不丢**：每次修改前保留旧版本（`history/`），删除先进 `trash/` 和云盘回收站，冲突时两边的版本都保留。
- **键盘优先**：`Ctrl K`、`/`、`J`/`K`、`N`、`Ctrl V`；中英双语，浅色和深色主题。

![粘贴导入](docs/images/paste.png)

## 云盘里的文件

```
AicialNote/
├── vault.json                设置
├── items/<id>.json           数据本体，每个 ID 一个文件
├── history/<id>/…            每次修改前的旧版本
├── trash/                    已删除的 ID
├── readable/ID-0001 名称.md   自动生成的可读版本
├── readable/全部账号.csv      自动生成的总表，Excel 可直接打开
└── index.json                自动生成的索引
```

完整格式说明见 [docs/data-format.md](docs/data-format.md)。

项目进度、设计决策和开发注意事项：[docs/status.md](docs/status.md)、[docs/decisions.md](docs/decisions.md)、[CLAUDE.md](CLAUDE.md)。

## 安全说明

- **AicialNote 目前不会对数据额外加密。** 云盘里的文件和浏览器中的本地缓存（IndexedDB）都是明文，它们的安全取决于你的云盘账号和你的设备，
  请务必为云盘账号开启两步验证。可选的端到端加密在开发计划中。
- **服务器看不到你的数据。** 它只负责完成 OAuth 登录。refresh token 保存在经过 AES-GCM 加密、设置了 HttpOnly 的 Cookie 中；
  服务器没有数据库，不保存任何内容。
- **最小权限。** Google Drive 使用 `drive.file`，只能访问 AicialNote 自己创建的文件；OneDrive 使用 `Files.ReadWrite.AppFolder`，
  只能访问 `应用/AicialNote` 文件夹。
- **严格的 CSP。** `script-src 'self'`，`connect-src` 只允许 Google Drive 和 OneDrive 的域名。

发现安全漏洞？请按 [SECURITY.md](SECURITY.md) 的方式私下报告，不要公开提 Issue。

## 开发

需要 Node 22+、pnpm 10+、Go 1.26+。

```sh
pnpm install
pnpm dev            # 前端 http://localhost:5173
pnpm dev:server     # OAuth 服务 :8080（需要 server/.env，参考 server/.env.example）
```

开发环境的登录页有「打开演示数据」，数据只保存在内存里，开发界面时不需要配置 OAuth。

```sh
pnpm test           # 单元测试（TypeScript + Go）
pnpm smoke          # 在 Chrome 中跑端到端检查（需先 pnpm dev）
pnpm screenshots    # 截图：浅色 / 深色、中文 / 英文
pnpm build          # 打包成单个二进制：server/bin/aicialnote
```

## 自己部署

见 [docs/self-hosting.md](docs/self-hosting.md)：注册 Google / 微软 OAuth 应用，配置 4 个环境变量，运行一个容器即可。

## 参与贡献

欢迎提 Issue 和 Pull Request，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[AGPL-3.0](LICENSE)。你可以自由运行、修改和再分发 AicialNote；如果把修改后的版本通过网络提供给他人使用，必须以同样的许可证公开源代码。
