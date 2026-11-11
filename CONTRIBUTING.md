# Contributing

Thanks for helping. Issues and pull requests are welcome, in English or Chinese (欢迎使用中文).

## Before you start

- Read [CLAUDE.md](CLAUDE.md). Despite the name, it holds the working notes for every contributor: the rules that must
  not break, the gotchas, and a map of the code.
- For anything larger than a bug fix, open an issue first so we can agree on the approach.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Setup

Requirements: Node 22+, pnpm 10+, Go 1.26+.

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev        # http://localhost:5173, then "Open demo data". No OAuth setup needed.
```

You only need `pnpm dev:server` and a `server/.env` (copy `server/.env.example`) to work on real sign-in. See
[docs/self-hosting.md](docs/self-hosting.md).

## A change is done when

```sh
pnpm lint && pnpm typecheck && pnpm test
```

pass. For UI changes, `pnpm smoke` must pass too (with `pnpm dev` running), and please look at `pnpm screenshots`
in light and dark mode.

## The rules that matter most

1. **No user data on the server.** The browser talks to Google and Microsoft directly; the server only handles
   `/auth/*`.
2. **Never lose data.** Overwrites copy the old version to `history/`, deletes go to `trash/`.
3. **The on-drive format is a public contract.** Changes need a matching update to
   [docs/data-format.md](docs/data-format.md).
4. **Every UI string is in both `web/src/i18n/zh.ts` and `en.ts`.**
5. **Design tokens only.** No raw colours, emoji or gradients. See [docs/design.md](docs/design.md).

## Pull requests

- Keep them focused: one change per PR.
- Describe what changed and how you tested it. Add screenshots for UI changes.
- Biome formats the code: `pnpm format`.

By contributing you agree that your contribution is licensed under the project's [AGPL-3.0](LICENSE) licence.
