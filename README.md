<div align="center">

<img src="web/public/favicon.svg" width="72" height="72" alt="AicialNote logo">

# AicialNote

**Your accounts and notes, in your own cloud drive.**

An open-source manager for logins, passwords, 2FA, recovery emails and proxies.<br>
No server-side database: your data stays in your Google Drive or OneDrive as plain files.

[![Website](https://img.shields.io/badge/website-aicialnotes.com-3e63dd)](https://aicialnotes.com)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3e63dd)](LICENSE)
[![CI](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml/badge.svg)](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml)
![Status: alpha](https://img.shields.io/badge/status-alpha-orange)

**[Open AicialNote at aicialnotes.com](https://aicialnotes.com)** ·
[Self-hosting](docs/self-hosting.md) ·
[Data format](docs/data-format.md) ·
[Report a bug](https://github.com/Eric-kbo/AnNote/issues)

**English** · [简体中文](README.zh-CN.md) · [繁體中文](docs/i18n/README.zh-TW.md) · [日本語](docs/i18n/README.ja.md) ·
[한국어](docs/i18n/README.ko.md) · [Español](docs/i18n/README.es.md) · [Deutsch](docs/i18n/README.de.md) ·
[Français](docs/i18n/README.fr.md) · [Português](docs/i18n/README.pt-BR.md) · [Русский](docs/i18n/README.ru.md)

![AicialNote account list](docs/images/list.png)

</div>

## Contents

- [Why AicialNote](#why-aicialnote)
- [Features](#features)
- [Getting started](#getting-started)
- [How it works](#how-it-works)
- [Security model](#security-model)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Why AicialNote

Most password managers keep your vault on their servers, in a format only their app can read. AicialNote does the
opposite:

- **You own the files.** Everything is stored in **your** Google Drive or OneDrive (or a local folder) as JSON, with
  Markdown and CSV copies generated next to it. If AicialNote disappears tomorrow, you can still open your data in
  any text editor or in Excel.
- **The server never sees your data.** The browser talks to Google and Microsoft directly. The small Go server only
  completes the OAuth sign-in and stores nothing.
- **Data is hard to lose.** Every overwrite keeps the previous version, every delete goes to a trash folder, and a
  sync conflict keeps both sides.

> [!WARNING]
> **AicialNote is alpha software.** Demo mode and the local folder are well tested; Google Drive and OneDrive sync is
> new. Keep a backup (**Export data… → Full backup (JSON)**) until it has proven itself for you, and read the
> [security model](#security-model) before you store real passwords.

## Features

- **One list for every identity.** Each ID holds cards: Google, Apple ID, Microsoft, OpenAI, Claude, email,
  website, API key, proxy, server, Wi-Fi, bank card, shipping address, profile, ID document or custom. Filter by status, tag, card type or upcoming expiry.
- **Copy with one click.** Click any value to copy it. 2FA fields show the live TOTP code.
- **Smart paste.** Paste `Email: a@gmail.com Password: …`, `email----password----recovery----2FA`,
  `ip:port:user:pass`, or a hundred such lines, and AicialNote fills in the fields.
- **Notebooks.** Notebooks, sections and pages with a rich text editor, in the style of OneNote. Accounts can be
  filed into sections next to your notes.
- **Local-first.** Reads and writes are instant and work offline. Syncing happens in the background.
- **Import and export.** Full JSON backups, CSV and Markdown exports, and a restore from any `trash/` copy.
- **Keyboard-first.** `Ctrl/⌘ K`, `/`, `J`/`K`, `N`, `Ctrl/⌘ V`. Light and dark themes, Chinese and English UI.

<p align="center">
  <img src="docs/images/detail.png" width="49%" alt="Account detail">
  <img src="docs/images/paste.png" width="49%" alt="Smart paste">
</p>

## Getting started

### Use the hosted version

Go to **[aicialnotes.com](https://aicialnotes.com)**, sign in with Google or Microsoft, and you're done. Nothing to
install. The site only gets permission to the files it creates:

| Provider     | Permission                  | What AicialNote can reach                 |
| ------------ | --------------------------- | ----------------------------------------- |
| Google Drive | `drive.file`                | Only files AicialNote created             |
| OneDrive     | `Files.ReadWrite.AppFolder` | Only the `Apps/AicialNote` folder         |
| Local folder | Browser file access         | Only the folder you pick (Chromium-based) |

### Host it yourself

AicialNote ships as a single binary (or one container) with the web app embedded. Register an OAuth app with Google
and/or Microsoft, set four environment variables and run it. See [docs/self-hosting.md](docs/self-hosting.md).

## How it works

```text
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

What you'll find in your drive:

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

The on-drive format is a public, versioned contract: [docs/data-format.md](docs/data-format.md).

## Security model

- **Your data is not encrypted by AicialNote yet.** The files in your drive and the browser's local cache (IndexedDB)
  are plain text. They are as safe as your cloud account and your device, so turn on two-step verification for the
  cloud account. Optional end-to-end encryption is on the roadmap.
- **The server never sees your data.** It only completes the OAuth sign-in. The refresh token lives in an AES-GCM
  encrypted, HttpOnly cookie; the server has no database and stores nothing.
- **Narrow permissions.** See the table in [Getting started](#use-the-hosted-version).
- **Strict CSP.** `script-src 'self'`, and `connect-src` lists only the Google Drive and OneDrive hosts.

Found a vulnerability? Please report it privately, as described in [SECURITY.md](SECURITY.md).

## Development

Requirements: Node 22+, pnpm 10+, Go 1.26+.

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev            # web app on http://localhost:5173
pnpm dev:server     # OAuth broker on :8080 (needs server/.env, see server/.env.example)
```

In development, the start page has an **Open demo data** button that runs entirely in memory, so you don't need OAuth
credentials to work on the UI.

```sh
pnpm test           # unit tests (TypeScript + Go)
pnpm typecheck
pnpm lint
pnpm smoke          # end-to-end checks in Chrome against `pnpm dev`
pnpm screenshots    # UI screenshots in light/dark, zh/en
pnpm build          # single binary with the web app embedded: server/bin/aicialnote
```

| Path               | Contents                                                          |
| ------------------ | ----------------------------------------------------------------- |
| `packages/core`    | data model, smart paste, TOTP, readable exports, vault operations |
| `packages/storage` | storage adapters: Google Drive, OneDrive, local folder, memory    |
| `web`              | React app: local cache, sync engine, UI                           |
| `server`           | Go: OAuth broker and static file server                           |
| `docs`             | data format, design principles, self-hosting                      |

Project status, design decisions and contributor notes: [docs/status.md](docs/status.md),
[docs/decisions.md](docs/decisions.md), [CLAUDE.md](CLAUDE.md).

## Roadmap

- [ ] Optional end-to-end encryption (same files, encrypted envelope)
- [ ] Mirror to a second drive
- [ ] Custom templates and statuses in settings
- [ ] Import from OneNote / CSV, export to an offline HTML viewer
- [ ] More UI languages
- [ ] Desktop and mobile builds

## Contributing

Issues and pull requests are welcome, in English or Chinese. Start with [CONTRIBUTING.md](CONTRIBUTING.md). For
anything larger than a bug fix, please open an issue first so we can agree on the approach.

## License

AicialNote is free software, licensed under the **[GNU Affero General Public License v3.0](LICENSE)**.

You may use, study, modify and redistribute it. If you run a modified version and let others use it over a network,
you must publish your source code under the same licence.

Copyright © 2026 Eric-kbo
