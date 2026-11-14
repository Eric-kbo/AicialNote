# Status

Last updated: **2026-11-11**, when the repository was prepared for its public release (AGPL-3.0, see D12). Update this file whenever something here changes.

## Where it stands

The MVP is complete and works end to end **in demo mode** (an in-memory drive) and **with a local folder** (verified
in Chrome through the real `LocalFolderAdapter`). Real cloud sign-in has not been exercised yet, because OAuth apps
haven't been registered.

Session 2 added OneNote-style notes next to the accounts: notebooks → sections → pages → subpages (up to 3 levels) with
a rich text editor (Tiptap). They sync through the same engine with the same history/trash/conflict rules, and are
stored as `notes/<id>.json` (see [data-format.md](data-format.md)).

Accounts can also live in the notebooks: a section holds pages, **account lists** (collapsible, with the account table
on the right) and single accounts (the account detail on the right). An account is filed by an optional `location` on
its item, so the data still exists once. The original "账号" list at `/` is kept unchanged as a comparison anchor; it
gained a Location column, and unfiled accounts show "未归档". Defaults chosen without the owner's answer (revisit):
one location per account; deleting a list/section unfiles its accounts instead of deleting them; account lists sit
inside sections (there is no "account section" kind); existing accounts start unfiled. Team use and a database backend were discussed and
deliberately deferred; the owner wants the frontend usable first.

### Verified

- Unit tests (`pnpm test`):
  - 46 for core: format, TOTP against RFC 6238 vectors, smart paste, history/trash/readable rules, the note tree
    (ordering, flattening, depth limits, move/indent/outdent rules), page → Markdown/plain text, and the backup
    format and import rules (newer-wins, display-id renumbering, unfiling lost locations, newer format refused).
  - 9 for storage: the adapter contract run against Memory and a fake Google Drive, plus OneDrive request shapes,
    409/412 handling and the 401-refresh-once path.
  - Go: the full login → callback → token flow against a fake identity provider, PKCE/state, cookie flags,
    rotated refresh tokens, CSRF rejection, and sign-out on `invalid_grant`.
- `pnpm smoke` in Chrome checks:
  - paste → create → open;
  - item JSON, readable MD and CSV appear on the drive;
  - an inline edit writes `history/`;
  - click-to-copy works, including for passwords;
  - search works;
  - delete → Undo, and delete → `trash/`;
  - bulk paste works;
  - notes: a new notebook comes with a section and page; rename; title + `/` menu + Ctrl+B + `[]` task shortcut reach
    `notes/<id>.json` and `readable/笔记/*.md`; pasting an HTML table (as from OneNote) keeps it; Tab makes a
    subpage; drag reorders; deleting a section trashes its pages and Undo restores them; Ctrl+K finds pages by body
    text;
  - a proxy card copies as one line (`socks5://user:pass@host:port`, `host:port:user:pass` …) in the picked format;
  - local folder (the folder picker is replaced by the browser's private file system, same API): files are written,
    and after the local cache is wiped everything is rebuilt from the folder;
  - the start page links to the GitHub repo;
  - importing an item's `trash/` copy brings it back; a full JSON backup downloads with items and notes, and importing
    it again changes nothing.
- The production binary serves the SPA under the strict CSP with no console errors. SPA fallback, `/healthz`, the
  provider list, the login redirect (PKCE) and the token endpoint without a session (401) all behave correctly.
- `pnpm lint` and `pnpm typecheck` are clean.
- Screenshots were reviewed in light and dark, in Chinese and English.

### Not verified yet

- **Real Google Drive and OneDrive sign-in and sync.** The adapters have only been tested against mocks. Expect to fix
  small API details on first contact.
- The local folder **picker dialog** itself and a folder that a desktop sync client (OneDrive, Google Drive for
  desktop) changes underneath the app.
- `docker build` (never run).
- Narrow and mobile layouts.

## Next steps, in order

1. **Register the OAuth apps** ([self-hosting.md](self-hosting.md)), fill in `server/.env`, then test with real data:
   sign-in, first sync, a second browser editing the same item (conflict path), and reload or long idle (token
   refresh).
2. Add a history and trash viewer so users can restore from inside the app (items and pages). The files exist, but
   there is no UI for them yet. (Import already restores a `trash/` file, but it never replaces a newer version with
   an older one, so `history/` versions need this viewer.)
3. Notes, next round: images and attachments (the storage contract is text-only today, so this needs a binary
   `write`), an account card block inside pages (link a page to items), page templates, and "move page to section…"
   from the menu (dragging a page onto a sidebar section is implemented but not covered by the smoke test).
4. Add settings: edit statuses and custom templates, and "save card as template".
5. Migrate from OneNote: paste a whole OneNote table, or import CSV, with column → field mapping. See "Column shapes
   to migrate" below. (Pasting OneNote content into a page already keeps headings, lists and tables.)
6. Add unit tests for `SyncEngine` with `MemoryAdapter`. Today it is covered only by the smoke test.
7. Use incremental pulls: Drive's `changes` API and Graph's `delta`, instead of listing `items/` and `notes/` every
   60s.
8. Shrink the bundle (main chunk 809 KB / 256 KB gzip; the editor is already split out, 472 KB / 149 KB gzip, loaded
   on the first page open). Try `zod/mini` and more route-level splitting.
9. Team use (discussed 2026-11-08, deferred): either a shared synced folder, a shared cloud folder (needs broader
   OAuth scopes), or a separate database backend behind a domain-level `VaultBackend` interface with capability
   flags. Field-level merge would be needed for concurrent edits.
10. Later: optional encryption (D6), a mirror to a second drive, an offline HTML export viewer, and desktop/mobile
    builds.
11. More languages (D17). Twelve shipped on 2026-11-11 besides zh and en. To add one: `web/src/i18n/locales/<tag>.json`,
    an entry in `EXTRA` (`web/src/i18n/languages.ts`), and `packages/core/src/locales/<tag>.ts` registered in its
    `index.ts` (the core test lists the labels it needs). The translations were machine-written and have not been
    reviewed by native speakers yet. Before right-to-left languages (Arabic, Hebrew, Persian), switch components to
    logical Tailwind classes. Smart paste still only recognises Chinese and English labels. The pseudo-locale (dev,
    language menu) shows clipped text on the start page: the "Stored in: …" hint of the cloud buttons.

## Known limitations

- `displayId` (ID-0001…) can be duplicated if two offline devices create items at the same time. `id` (a ULID) stays
  unique, so no data is lost.
- Conflicts are resolved at item level, and the local version wins. The other device's edit survives only in
  `history/`, and nothing in the UI tells you which fields differed.
- Files that are corrupt or were edited by hand are skipped with a `console.warn`. The UI says nothing.
- `LocalFolderAdapter` derives its etag from `lastModified` and file size, so a same-size write in the same
  millisecond goes undetected.
- Signing out deletes the local plaintext cache. If changes are still unsynced, a plain `window.confirm` asks first.
  That dialog isn't styled yet.
- The demo mode button exists only in dev builds.

## Open questions for the owner

These were asked but not answered yet:

- Do you need to use AicialNote on a phone (read only, or editing too)?
- Will several devices edit at the same time? If so, conflict handling may need field-level merging.
- Should accounts kept for other people be **shared** with them? That needs a sharing and permissions design.

## Column shapes to migrate

The OneNote tables AicialNote replaces have these column sets. They guide the templates and the migration tool:

| Kind of table      | Columns                                             | Covered by                                                                   |
| ------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| App Store accounts | 来源, 账号, 密码, 手机, 是否付费, 备注              | `apple` template + tags + notes; **来源 has no field yet**                   |
| Google accounts    | 账号, 密码, 2FA, 辅助邮箱, 手机号, 状态             | `google` template + item status                                              |
| Proxies            | #, IP, 用户名, 密码, 地区, 过期时间, 使用时间, 备注 | `proxy` template; **使用时间 has no field yet**                              |
| Reference links    | 链接, 名称, 说明                                    | `website` card or notes; a "links" type may suit better                      |
| One pasted message | a free-form message with login details and links    | smart paste → fields + notes                                                 |
| Third-party logins | 来源, 账号, 密码, 代理, 已经登录, 2fa               | `website`/`google` + `proxy` cards; **来源 and 已经登录 have no fields yet** |

Recurring columns with no field yet: **来源 (source)**, **是否付费 (paid)**, **使用时间 (in use since)** and
**已经登录 (logged in)**. Add them to templates, or make them easy as custom fields, before building the migration
tool.
