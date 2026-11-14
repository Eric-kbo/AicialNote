# AicialNote: working notes

Read this before changing anything. It is written for both human contributors and AI coding agents.

| Doc                                          | What it answers                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [docs/status.md](docs/status.md)             | Where the project stands, what is verified and what isn't, what to do next, open questions |
| [docs/decisions.md](docs/decisions.md)       | Why it is built this way, and which alternatives were rejected                             |
| [docs/data-format.md](docs/data-format.md)   | The on-drive file format, which is a public contract                                       |
| [docs/design.md](docs/design.md)             | UI principles and design tokens                                                            |
| [docs/self-hosting.md](docs/self-hosting.md) | OAuth app registration, env vars, deployment                                               |

## What this is

AicialNote is an open-source manager for account details: logins, passwords, 2FA, recovery emails and proxies. It
replaces the owner's OneNote pages. Data lives in the **user's own** Google Drive or OneDrive as JSON, with Markdown and
CSV copies generated next to it. The site is a thin client. The Go server is only an OAuth broker and never sees user
data.

The owner's two hard requirements are that **data must never be lost** and that **the UI must feel like a polished
big-company product with no "AI-generated" look**.

## Commands

```sh
pnpm install            # set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1; Playwright uses the locally installed Chrome
pnpm dev                # web on http://localhost:5173 (proxies /auth → :8080)
pnpm dev:server         # Go OAuth broker on :8080, reads server/.env
pnpm test               # vitest (packages/core, packages/storage) + go test
pnpm typecheck
pnpm lint               # Biome; `pnpm format` auto-fixes
pnpm i18n:report        # how complete each translation in web/src/i18n/locales/ is
pnpm smoke              # Playwright end-to-end checks in demo mode, needs `pnpm dev` running
pnpm screenshots [dir]  # light/dark and zh/en screenshots, needs `pnpm dev` running
pnpm build              # web build embedded into server/bin/aicialnote(.exe)
pnpm build:linux        # same, cross-compiled: server/bin/aicialnote-linux-amd64
```

A change counts as done only when `lint`, `typecheck` and `test` pass. For UI changes, `smoke` must also pass and you
must look at the screenshots in light and dark.

The start page shows **打开演示数据 / Open demo data** in dev builds. It runs a fully seeded in-memory "drive", so no
OAuth is needed. In dev, `window.__aicialnoteDemoStorage` exposes that drive so `scripts/smoke.mjs` can check what was
written.

## Map

```
packages/core/src      schema.ts (zod, on-drive format)   templates.ts   item.ts   paste.ts (smart paste)
                       totp.ts   readable.ts (MD/CSV/README)   remote.ts (VaultRemote: history/trash rules)
                       notes.ts (notebook/section/page tree, order keys, move rules, page → Markdown)
                       backup.ts (export file, import parsing and merge plan)
packages/storage/src   types.ts (adapter contract)   memory / local-folder / onedrive / google-drive   http.ts
web/src                session.tsx (which storage)   data/db.ts (Dexie)   data/sync.ts (SyncEngine)
                       data/vault.tsx (hooks + mutations)   data/auth.ts   data/demo.ts
                       pages/ (Connect, List, Detail, Notes)   components/ (FieldRow, CardView, PasteDialog,
                       DataDialogs = export/import, …)   i18n/ (message.ts, languages.ts, locales/)   lib/links.ts (repo URL, site host, contact email)
                       components/notes/ (Sidebar, PagesPane, PageEditor = Tiptap, lazy-loaded)   lib/dnd.ts   lib/prefs.ts
server/                cmd/aicialnote   internal/auth (handler, providers, refresh)   internal/session (cookie sealer)
                       internal/webui (embedded SPA)   internal/httpx (CSP, headers)   internal/config
scripts/               build.mjs   smoke.mjs   screenshots.mjs
```

## Rules that must not break

1. **User data never touches the server.** The browser calls Google and Microsoft APIs directly. The server only
   handles `/auth/*`.
2. **The on-drive format is a contract.** If you change it, update `docs/data-format.md` in the same change. New
   optional keys don't bump `formatVersion`. Schemas are `z.looseObject` so that unknown keys survive a round trip.
   Never overwrite a file whose `formatVersion` is newer than this code supports.
3. **No silent data loss.** Every overwrite of `items/<id>.json` first copies the old content to `history/`. Every
   delete goes to `trash/` and to the provider's recycle bin. On a conflict, the local version wins and the remote
   version goes to `history/`.
4. **Every UI string goes in both `web/src/i18n/zh.ts` and `en.ts`.** `en` is typed as `Record<keyof zh>`, so a missing
   key fails to compile. Other languages live in `web/src/i18n/locales/<tag>.json` and may be incomplete (decisions
   D17). Counts use ICU plurals, `{n, plural, one {# file} other {# files}}`, never `{n} files`. Dates and numbers go
   through `Intl` with `intlLocale` from `useI18n()`, never `locale === 'zh'`.
5. **Use design tokens only** (`bg`, `surface`, `fg-2`, `accent`, `st-*` …). Don't use raw colours, emoji, gradients,
   or shadows on resting surfaces. See `docs/design.md`.
6. **CSP is `script-src 'self'`.** Inline `<script>` is not allowed; that's why the theme bootstrap lives in
   `web/public/theme.js`. If the browser must reach a new external host, add it to `connect-src` in
   `server/internal/httpx/middleware.go`.
7. **Secrets stay out of the search index.** `searchText()` skips `password` and `totp` fields.

## Gotchas learned the hard way

**OAuth / providers**

- Microsoft's token endpoint needs `scope` on refresh requests, and `golang.org/x/oauth2` doesn't send it. That's why
  `server/internal/auth/refresh.go` does the refresh by hand. Microsoft also rotates refresh tokens, so always store
  the newest one.
- While a Google app is in **Testing** mode, its refresh tokens expire after **7 days**. Publish the app before real
  use.
- Microsoft SPA (public client) refresh tokens last only 24h. The confidential "Web" client used here gets a 90-day
  sliding window. This is one of the reasons the backend exists.
- Google asks for `prompt=consent` + `access_type=offline` every time; otherwise Google may not return a refresh token
  (the callback then fails with `no_refresh_token`).
- Google Drive is id-based. The adapter resolves paths folder by folder and **caches the in-flight folder promise**.
  Without that cache, concurrent first writes create duplicate `AicialNote/` folders. The file's etag is Drive's
  `version`.
- OneDrive: `@microsoft.graph.downloadUrl` is pre-authenticated, so don't send the bearer token to it. For personal
  accounts it points at `*.microsoftpersonalcontent.com`, which must be in `connect-src`. The Vite dev server sends
  no CSP, so a missing host only shows up in the built server as "Failed to fetch". Create-only
  writes use `?@microsoft.graph.conflictBehavior=fail` (returns 409). Conditional writes use `If-Match` (returns 412).

**Sync engine (`web/src/data/sync.ts`)**

- The outbox is coalesced per key, so only the newest entry per item is pushed.
- Deletes are pushed after a 6s delay, which gives "Undo" time to work.
- Pulls run every 60s, on focus and on `online`.
- An empty `items/` listing while more than 3 items are known is treated as a provider glitch and ignored, so it
  doesn't wipe the local cache.
- `vault.json` → `nextSeq` is merged by taking the maximum.
- Default status labels are written into `vault.json` when the vault is created, so changing a default in
  `defaultStatuses` doesn't reach existing vaults. Add the old spelling to `RENAMED_STATUS_LABELS`
  (`packages/core/src/templates.ts`) in the same change. Never migrate what the user wrote (decisions D16).
- A failure writing `readable/` must never block the real data write.
- Items and notes share the `sync` table (`kind: 'note'` marks notes). Any "deleted on another device" check must
  filter by kind, or every note looks deleted to the item pull and vice versa.
- Page edits push 4s after the last keystroke (`updateNote(..., { typing: true })`), because every push leaves a
  `history/` copy. History file names carry milliseconds so two quick pushes never share a file.

**Notes UI**

- Account nodes in the tree are derived: `buildTree(notes, items)` turns every item with a `location` into a node of
  kind `account` (same id as the item). Moving one writes the item (`placeItem`), not a note; `commands.ts → apply`
  routes it. Never write an `account` node to `notes/`.
- `Note` is the tree node type (kind includes `account`); `NoteFile` is what `notes/` stores. `Omit<>` on these loose
  zod types turns every key into `unknown`, which is why `Note` is a mapped type.
- The note tree comes from one `NoteTreeProvider` (one live query). Don't call `useLiveQuery` per row: child rows then
  start with `undefined` and crash.
- Tiptap's `focus()` waits a frame. When Enter in the title moves into the body, focus the DOM node synchronously
  too, or the next keystroke lands in the title.
- A component that debounces a save must also save on unmount. Blur doesn't fire reliably when an element is removed.
- In Playwright, `getByRole('button', { name })` matches substrings. "更多" also matches "更多操作", and the editor
  toolbar's "撤销" collides with the toast's "撤销".

**React**

- `StrictMode` runs effects twice. The session boot consumes `?connected=` / `?auth_error=` from the URL, so it is
  guarded by a ref. `VaultProvider` can close its Dexie db mid-init, so that error is swallowed when `cancelled`.

**Smart paste (`packages/core/src/paste.ts`, see the tests for examples)**

- ASCII labels need word boundaries; otherwise `user` matches inside `user1` in `1.2.3.4:8080:user1:pass`.
- English words count as labels only when a separator follows (`Email: …`). CJK labels can be glued to the value
  (`密码123`).
- A CJK label glued to running text is not a label. Example: `一个地区IP使用约7天` must not become region=`IP使用约7天`.
- Classify proxy shapes **before** emails, because `user:pass@host:port` contains an `@`.
- Bulk mode applies only when every line is a record on its own (2+ tokens, or a proxy URI). Values spread over
  several lines are treated as one entry.
- Key-value text (`parseKeyValues`) runs before the old paths and needs evidence: a known label, a clear separator
  (`Key: v`, `k=v`, `键：v`, `【键】v`), several pairs on one line, or `a:a1` and `c c1` mixed in one paragraph.
  Without it, `alice:secret1` / `alice secret1` lines stay bulk login pairs. Unknown keys become fields under their
  own label. The whole rest of the line is the value, so `2026-12-12 20:29:04` keeps its time.
- Known labels are every template label in every drive language plus the aliases, so "copy card" round-trips
  (there is a test for it). When a label maps to two roles (`地址` = host or postal address), the value decides.

**Editing UX**

- `Enter` jumps to the next **empty** field (fast filling). `Tab` moves to the next field. Blur saves. `Esc` cancels.

## Environment notes (owner's machine: Windows 10, Git Bash)

- Tool versions in use: Node 22, pnpm 10.33, Go 1.26, TypeScript 7, Vite 8, Vitest 5, Biome 2.6, zod 4, Tailwind 4,
  React 19.
- Biome 2.6 uses `"preset": "recommended"`, because the `recommended` field is deprecated. It also formats Markdown and
  YAML.
- Bash heredocs containing quotes, and Python string replacements containing `\s` / `\/`, corrupted regex source
  several times. Edit code with the editor tools rather than shell text substitution.
- `server/internal/webui/dist/` is overwritten by `pnpm build`. Only `.gitkeep` is tracked.
- For test selectors, prefer data attributes (for example `data-field-row`) over Tailwind classes such as
  `group/row`. The `/` in those class names breaks CSS selectors.
