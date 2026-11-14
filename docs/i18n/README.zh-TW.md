<div align="center">

<img src="../../web/public/favicon.svg" width="72" height="72" alt="AicialNote 標誌">

# AicialNote

**帳號資料和筆記，存在你自己的雲端硬碟裡。**

開源的帳號資料管理工具：帳號、密碼、2FA、備援電子郵件、代理 IP。<br>
伺服器上沒有資料庫，資料以一般檔案的形式儲存在你自己的 Google Drive 或 OneDrive 中。

[![官網](https://img.shields.io/badge/官網-aicialnotes.com-3e63dd)](https://aicialnotes.com)
[![授權條款: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3e63dd)](../../LICENSE)
[![CI](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml/badge.svg)](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml)
![狀態: Alpha](https://img.shields.io/badge/status-alpha-orange)

**[立即使用：aicialnotes.com](https://aicialnotes.com)** ·
[自行架設](../../docs/self-hosting.md) ·
[資料格式](../../docs/data-format.md) ·
[回報問題](https://github.com/Eric-kbo/AnNote/issues)

[English](../../README.md) · [简体中文](../../README.zh-CN.md) · **繁體中文** · [日本語](README.ja.md) ·
[한국어](README.ko.md) · [Español](README.es.md) · [Deutsch](README.de.md) ·
[Français](README.fr.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md)

![AicialNote 帳號清單](../../docs/images/list.png)

</div>

## 目錄

- [為什麼選擇 AicialNote](#為什麼選擇-aicialnote)
- [功能](#功能)
- [開始使用](#開始使用)
- [運作原理](#運作原理)
- [安全說明](#安全說明)
- [開發](#開發)
- [開發計畫](#開發計畫)
- [參與貢獻](#參與貢獻)
- [授權條款](#授權條款)

## 為什麼選擇 AicialNote

大多數密碼管理工具把你的資料存放在它們的伺服器上，而且格式只有它們的應用程式能讀取。AicialNote 正好相反：

- **檔案歸你所有。** 所有內容以 JSON 儲存在**你自己的** Google Drive 或 OneDrive（或本機資料夾）中，旁邊會自動產生
  Markdown 和 CSV 副本。即使 AicialNote 明天消失了，你仍然可以用任何文字編輯器或 Excel 開啟自己的資料。
- **伺服器看不到你的資料。** 瀏覽器直接與 Google 和 Microsoft 連線。那個小小的 Go 伺服器只負責完成 OAuth 登入，不儲存任何內容。
- **資料很難遺失。** 每次覆寫都會保留前一個版本，每次刪除都會移到垃圾桶資料夾，同步衝突時兩邊的版本都會保留。

> [!WARNING]
> **AicialNote 目前是 Alpha 版軟體。** 示範模式和本機資料夾已經過充分測試；Google Drive 和 OneDrive 同步功能還很新。
> 在它經過你的實際使用驗證之前，請保留備份（**Export data… → Full backup (JSON)**），並在存放真實密碼前先閱讀[安全說明](#安全說明)。

## 功能

- **一個清單管理所有身分。** 每個 ID 底下有多張卡片：Google、Apple ID、Microsoft、OpenAI、Claude、
  電子郵件、網站、API 金鑰、代理 IP、伺服器、Wi-Fi、銀行卡、收件地址、個人資料、證件或自訂。
  可依狀態、標籤、卡片類型或即將到期篩選。
- **一鍵複製。** 點一下任何值就能複製。2FA 欄位會即時顯示目前的 TOTP 驗證碼。
- **智慧貼上。** 貼上 `Email: a@gmail.com Password: …`、`email----password----recovery----2FA`、
  `ip:port:user:pass`，或上百行這樣的內容，AicialNote 會自動填入欄位。
- **筆記本。** 類似 OneNote 的筆記本、區段和頁面，附有格式化文字編輯器。帳號也可以歸檔到區段中，和筆記放在一起。
- **本機優先。** 讀寫即時生效，離線也能使用。同步會在背景進行。
- **匯入與匯出。** 完整 JSON 備份、CSV 和 Markdown 匯出，也能從任何 `trash/` 中的副本還原。
- **鍵盤優先。** `Ctrl/⌘ K`、`/`、`J`/`K`、`N`、`Ctrl/⌘ V`。淺色與深色主題，介面提供中文和英文。

<p align="center">
  <img src="../../docs/images/detail.png" width="49%" alt="帳號詳細資料">
  <img src="../../docs/images/paste.png" width="49%" alt="智慧貼上">
</p>

## 開始使用

### 使用官方網站

前往 **[aicialnotes.com](https://aicialnotes.com)**，使用 Google 或 Microsoft 帳號登入即可，不需要安裝任何東西。網站只會取得它自己建立的檔案的權限：

| 儲存位置     | 權限                        | AicialNote 能存取的範圍                   |
| ------------ | --------------------------- | ----------------------------------------- |
| Google Drive | `drive.file`                | 只有 AicialNote 建立的檔案                |
| OneDrive     | `Files.ReadWrite.AppFolder` | 只有 `Apps/AicialNote` 資料夾             |
| 本機資料夾   | 瀏覽器檔案存取              | 只有你選擇的資料夾（Chromium 系列瀏覽器） |

### 自行架設

AicialNote 以單一執行檔（或單一容器）發布，網頁應用程式已內嵌其中。向 Google 和/或 Microsoft 註冊 OAuth 應用程式，
設定四個環境變數，然後執行即可。請參閱 [docs/self-hosting.md](../../docs/self-hosting.md)。

## 運作原理

```text
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

雲端硬碟中會有這些檔案：

```text
AicialNote/
├── vault.json                 settings
├── items/<id>.json            the data, one file per ID
├── notes/<id>.json            notebooks, sections and pages
├── history/<id>/…             previous versions, kept on every change
├── trash/                     deleted items
├── readable/                  generated Markdown and CSV copies (open in any editor or Excel)
└── index.json                 generated index
```

雲端硬碟上的檔案格式是公開且有版本編號的約定：[docs/data-format.md](../../docs/data-format.md)。

## 安全說明

- **AicialNote 目前還不會加密你的資料。** 雲端硬碟中的檔案和瀏覽器的本機快取（IndexedDB）都是純文字。它們的安全性取決於你的雲端帳號和裝置，
  因此請務必為雲端帳號啟用兩步驟驗證。可選的端對端加密已列入開發計畫。
- **伺服器看不到你的資料。** 它只負責完成 OAuth 登入。refresh token 存放在經 AES-GCM 加密、設定為 HttpOnly 的 Cookie 中；
  伺服器沒有資料庫，也不儲存任何內容。
- **最小權限。** 請參閱[開始使用](#使用官方網站)中的表格。
- **嚴格的 CSP。** `script-src 'self'`，且 `connect-src` 只列出 Google Drive 和 OneDrive 的主機。

發現安全漏洞？請依照 [SECURITY.md](../../SECURITY.md) 的說明私下回報。

## 開發

需求：Node 22+、pnpm 10+、Go 1.26+。

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev            # 網頁應用程式：http://localhost:5173
pnpm dev:server     # OAuth 中介服務：:8080（需要 server/.env，請參考 server/.env.example）
```

在開發環境中，起始頁有一個 **Open demo data** 按鈕，完全在記憶體中執行，因此開發介面時不需要 OAuth 憑證。

```sh
pnpm test           # 單元測試（TypeScript + Go）
pnpm typecheck
pnpm lint
pnpm smoke          # 在 Chrome 中針對 `pnpm dev` 執行端對端檢查
pnpm screenshots    # 介面截圖：淺色/深色、中文/英文
pnpm build          # 內嵌網頁應用程式的單一執行檔：server/bin/aicialnote
```

| 路徑               | 內容                                                   |
| ------------------ | ------------------------------------------------------ |
| `packages/core`    | 資料模型、智慧貼上、TOTP、可讀格式匯出、資料操作       |
| `packages/storage` | 儲存配接器：Google Drive、OneDrive、本機資料夾、記憶體 |
| `web`              | React 應用程式：本機快取、同步引擎、使用者介面         |
| `server`           | Go：OAuth 中介服務和靜態檔案伺服器                     |
| `docs`             | 資料格式、設計原則、自行架設                           |

專案狀態、設計決策和貢獻者須知：[docs/status.md](../../docs/status.md)、
[docs/decisions.md](../../docs/decisions.md)、[CLAUDE.md](../../CLAUDE.md)。

## 開發計畫

- [ ] 可選的端對端加密（檔案結構不變，內容加密封裝）
- [ ] 鏡像到第二個雲端硬碟
- [ ] 在設定中自訂範本和狀態
- [ ] 從 OneNote / CSV 匯入，匯出為離線 HTML 檢視器
- [ ] 更多介面語言
- [ ] 桌面版和行動版

## 參與貢獻

歡迎以英文或中文提出 Issue 和 Pull Request。請先閱讀 [CONTRIBUTING.md](../../CONTRIBUTING.md)。
比修正錯誤更大的變更，請先開 Issue，讓我們就做法達成共識。

## 授權條款

AicialNote 是自由軟體，採用 **[GNU Affero 通用公共授權條款 v3.0](../../LICENSE)** 授權。

你可以使用、研究、修改和重新散布它。如果你執行修改過的版本，並讓他人透過網路使用，就必須以相同的授權條款公開你的原始碼。

Copyright © 2026 Eric-kbo
