# AicialNote

**Your accounts, in your own cloud drive.**

AicialNote is an open-source manager for account details: logins, passwords, 2FA secrets, recovery emails, proxies,
and whatever else you need to keep per identity. It stores nothing on a server. Your data lives in **your** Google Drive
or OneDrive as plain JSON, Markdown and CSV, so it stays readable even if AicialNote disappears.

> **Status: alpha.** Demo mode and the local folder are well tested; Google Drive and OneDrive sync is new. Keep a
> backup (**Export data… → Full backup (JSON)**) until it has proven itself for you. Please read [Security model](#security-model)
> before you store real passwords.

[中文说明](README.zh-CN.md)

![List](docs/images/list.png)

## Features

- **One list for everything.** Each ID holds cards (Google, Apple ID, Microsoft, email, proxy, website, profile,
  custom). Filter by status, tag, card type or upcoming expiry.
- **Copy with one click.** Click any value to copy it. 2FA fields show the live code.
- **Smart paste.** Paste `账号 a@gmail.com 密码 … 辅助邮箱 …`, `email----password----recovery----2FA`,
  `ip:port:user:pass`, or a hundred such lines, and AicialNote fills in the fields.
- **Local-first.** Reads and writes are instant and work offline; syncing happens in the background.
- **Hard to lose data.** Every overwrite keeps the previous version in `history/`, deletes go to `trash/` and the
  provider's recycle bin, and conflicts keep both versions.
- **Keyboard-first.** `Ctrl/⌘ K`, `/`, `J`/`K`, `N`, `Ctrl/⌘ V`. Chinese and English UI, light and dark themes.

![Detail](docs/images/detail.png)

## How it works

```
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

See [docs/data-format.md](docs/data-format.md) for the on-drive format and its durability guarantees.

Project status, design decisions and contributor notes: [docs/status.md](docs/status.md),
[docs/decisions.md](docs/decisions.md), [CLAUDE.md](CLAUDE.md).

## Security model

- **Your data is not encrypted by AicialNote yet.** The files in your drive and the browser's local cache
  (IndexedDB) are plain text. They are as safe as your cloud account and your device, so turn on two-step
  verification for the cloud account. Optional end-to-end encryption is on the roadmap.
- **The server never sees your data.** It only completes the OAuth sign-in. The refresh token lives in an AES-GCM
  encrypted, HttpOnly cookie; the server has no database and stores nothing.
- **Narrow permissions.** On Google Drive, `drive.file` only reaches files AicialNote created. On OneDrive,
  `Files.ReadWrite.AppFolder` only reaches `Apps/AicialNote`.
- **Strict CSP.** `script-src 'self'`, and `connect-src` lists only the Google Drive and OneDrive hosts.

Found a vulnerability? Please report it privately, as described in [SECURITY.md](SECURITY.md).

## Development

Requirements: Node 22+, pnpm 10+, Go 1.26+.

```sh
pnpm install
pnpm dev            # web app on http://localhost:5173
pnpm dev:server     # OAuth broker on :8080 (needs server/.env, see server/.env.example)
```

In development, the start page has an **Open demo data** button that runs entirely in memory, so you don't need
OAuth credentials to work on the UI.

```sh
pnpm test           # unit tests (TypeScript + Go)
pnpm typecheck
pnpm lint
pnpm smoke          # end-to-end checks in Chrome against `pnpm dev`
pnpm screenshots    # UI screenshots in light/dark, zh/en
pnpm build          # single binary with the web app embedded: server/bin/aicialnote
```

| Path               |                                                                   |
| ------------------ | ----------------------------------------------------------------- |
| `packages/core`    | data model, smart paste, TOTP, readable exports, vault operations |
| `packages/storage` | storage adapters: Google Drive, OneDrive, local folder, memory    |
| `web`              | React app: local cache, sync engine, UI                           |
| `server`           | Go: OAuth broker and static file server                           |
| `docs`             | data format, design principles, self-hosting                      |

## Self-hosting

See [docs/self-hosting.md](docs/self-hosting.md): register OAuth apps, set four environment variables, run one
container.

## Roadmap

- Optional end-to-end encryption (same files, encrypted envelope)
- Mirror to a second drive
- Custom templates and statuses in settings
- Import from OneNote / CSV, export to an offline HTML viewer
- Desktop and mobile builds

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0](LICENSE). You may run, modify and redistribute AicialNote. If you offer a modified version to others
over a network, you must publish its source under the same licence.
