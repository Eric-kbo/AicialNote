# Decisions

Why AicialNote is built the way it is. Each entry gives the decision, the reason, and the alternatives that were
rejected. Add a new entry when a decision changes. Don't rewrite history.

Context: the owner kept account details (App Store, Google, proxy IPs, purchased accounts, other people's accounts) in
OneNote tables. OneNote was hard to search and hard to read, and the owner worried about losing the data. The owner
works with many mainland-China clients but is **not** based in mainland China, so the Great Firewall is not a v1
constraint.

---

## D1. Data lives in the user's own drive. There is no app database.

- **Why:** "Data must never be lost" and "stay readable even if the site disappears." A user's drive outlives any
  hobby service, and its files can be opened with nothing but a text editor.
- **Consequences:** the site is a thin client, and anyone can self-host it. The on-drive format is a public contract
  ([data-format.md](data-format.md)).
- **Rejected:** a hosted database (it can be lost or breached, and the user doesn't own it). A local-only
  desktop app with backups (the owner wanted a website and cloud access everywhere).

## D2. No accounts of our own in v1. Signing in means OAuth to the drive.

- **Why:** without data on our side, an AicialNote account would only store "which drive". Drive OAuth already proves
  identity.
- **Later:** if hosted plans or sharing arrive, add an account system that stores _who_ and _which drive_, never the
  data.

## D3. A small Go backend acts only as an OAuth broker.

- **Why a backend at all:**
  - Long-lived Google access needs a refresh token, and getting one requires the `client_secret`, which can't
    ship to a browser.
  - Microsoft gives browser-only (SPA) apps 24-hour refresh tokens. A confidential web client gets a 90-day sliding
    window.
- **Why Go:** the owner asked for it. A Go binary can also embed the built SPA (`embed`), so a self-hoster runs one
  binary or one container with no database.
- **Scope:** `/auth/{provider}/login|callback|token|logout` and `/auth/providers`, plus serving the SPA. The server is
  stateless.
- **Rejected:** a pure SPA, where the user would see a re-consent popup every hour on Google. A TypeScript/Hono worker
  on Cloudflare (it was viable, but the owner preferred Go). A session database (not needed yet).

## D4. Token storage

- The refresh token sits in an **AES-256-GCM encrypted, HttpOnly, SameSite=Strict cookie** (`an_s_<provider>`,
  path `/auth/`). The cookie name is bound as associated data.
- The access token lives **only in browser memory**. After a reload, the app calls `POST /auth/{p}/token` again.
- CSRF protection: a custom header `X-AicialNote: 1` plus a same-origin `Origin` check. The OAuth flow itself uses
  `state` and PKCE (S256).
- **Rejected:** a refresh token in `localStorage`, because any XSS or malicious extension could steal months of drive
  access.
- Signing out clears the cookie and the local cache. It doesn't revoke the grant, so the user's other devices stay
  signed in.

## D5. Least-privilege scopes

- Google `drive.file`: AicialNote sees only files it created. The scope is non-sensitive, so Google requires no security
  assessment. The folder `My Drive/AicialNote` is visible to the user.
- Microsoft `Files.ReadWrite.AppFolder`: the user sees the data under `Apps/AicialNote`.

## D6. Plaintext by default. Encryption comes later as an envelope.

- **Why:** this was the owner's decision. The drive is already private to the user, and readable files are the whole
  point.
- **Risk to communicate:** if someone gets into the drive account, they get every password and 2FA secret. The drive
  account must have 2FA turned on.
- **Plan:** an optional envelope `{format: "aicialnote.encrypted", kdf, iv, data}` around the same JSON, implemented as
  a storage layer. The UI and the data model don't change.

## D7. One file per item, plus generated readable copies

- **Why:**
  - Writes stay small.
  - Two devices editing different items never conflict.
  - Users can find an item by its file name.
  - `readable/*.md` and a CSV give humans a view that needs no app at all.
- **Rejected:** a single `vault.json` with everything in it (every save rewrites everything, and every edit
  conflicts). SQLite or SQLCipher (not human-readable on the drive).

## D8. Local-first: IndexedDB cache plus an outbox

- **Why:** a "big-company feel" means no spinners on every click. The UI reads and writes Dexie instantly, and
  `SyncEngine` pushes and pulls in the background. The app also works offline.
- **Conflict policy:** the local version wins and the remote version is saved to `history/`. Nothing is dropped. Field
  merging was judged not worth the complexity in v1.

## D9. Data model: ID → cards → fields

- This follows the owner's sketch: one list of IDs, where each ID groups everything about one identity. The detail
  page shows it card by card, and every field can be copied.
- Every field carries its own `label` and `type`, so a file makes sense without templates. Templates are only starting
  points. `role` adds meaning for paste and list summaries.

## D10. Pasting is the main way to enter data

- **Why:** the owner's data mostly arrives as pasted text (messages, emails, old notes), for example `账号 … 密码 … 辅助邮箱 … 温馨提示…` or
  `email----pass----recovery----2FA`. Parsing that beats forms.
- In-place editing covers the rest: click copies, double-click edits, saving is automatic, and deletes offer Undo
  instead of a confirm dialog.

## D11. Frontend stack and look

- React 19, Vite, TypeScript, Tailwind v4 with our own design tokens, Radix primitives (`radix-ui`), cmdk, TanStack
  Router and Virtual, Dexie, zod. The monorepo uses pnpm. Biome handles lint and formatting.
- **Deliberately not** shadcn's default styles: the owner explicitly wants no "AI look". The visual system lives in
  `web/src/styles.css` and [design.md](design.md).

## D12. Licence: AGPL-3.0 (decided 2026-11-11)

- `AGPL-3.0-only`, in `LICENSE`. It stops others from running a closed hosted fork: anyone who serves a modified
  version must publish its source (Bitwarden uses the same model).
- **Rejected:** MIT. It would allow wider reuse, but also a closed hosted copy of a tool that handles passwords.
- The official instance's domain and contact address are build-time defaults (`VITE_SITE_HOST`,
  `VITE_CONTACT_EMAIL` in `web/src/lib/links.ts`), so a self-hosted build shows its own on the privacy and terms
  pages. See [self-hosting.md](self-hosting.md#2-configure).

## D13. Providers in v1: Google Drive, OneDrive and a local folder

- The local folder uses the File System Access API (Chromium only). Pointing it at a folder synced by a desktop client
  covers Dropbox, iCloud and similar services.
- A mainland-China option such as 坚果云 (WebDAV) would need a CORS proxy. It is deferred until clients need it.

## D14. Renamed from OnlyNote to AicialNote (2026-11-09)

- Everything was renamed: UI text, packages (`@aicialnote/*`), the Go module and binary, env vars
  (`AICIALNOTE_*`), the CSRF header, cookies (`an_*`), the drive folder, and the IndexedDB and localStorage keys.
- **Why a clean rename is safe:** no cloud vault existed yet, because OAuth apps had never been registered.
- **Compatibility kept:** files tagged `onlynote.*` are still read and get the new tag on their next save (see
  [data-format.md](data-format.md#former-name)). Without this, a local folder written before the rename could not be
  parsed.
- **Not migrated:** the browser's local cache, theme, language and list prefs start fresh under the new keys, and a
  local folder has to be picked again. The data in the folder isn't affected.
- When registering the Microsoft app, name it **AicialNote**: its display name becomes the `Apps/` folder name.

## D15. Export and import (2026-11-11)

- Export is a download built in the browser from the local cache, so data still never touches the server. Two
  formats: a full JSON backup (restorable) and the accounts CSV (for spreadsheets only).
- Import merges and never deletes: unknown ids are added, known ids are replaced only by a strictly newer
  `updatedAt`, and the replaced version reaches `history/` through the normal push. A preview shows the counts before
  anything is written. See [data-format.md](data-format.md#backup-file-export).
- **Rejected:** "replace the whole vault with the backup". It would delete anything created after the backup, which
  breaks "data must never be lost".
- **Not covered yet:** restoring an older version over a newer one (that is the history viewer's job, next steps 2),
  and CSV import from other tools (needs column mapping, next steps 5).
- The start page links to the GitHub repo. The URL lives in `web/src/lib/links.ts` and can be overridden with
  `VITE_REPO_URL` at build time, so self-hosted forks can point at their own repository.

## D16. Defaults written to the drive are migrated, user content is not (2026-11-11)

- Labels are stored on the drive on purpose (D7, D9): a file has to make sense without the app. The cost is that a
  default the app wrote into `vault.json` stays there when the default later changes. The first public release
  renamed the `warming` status from 养号中 to 准备中, and vaults created earlier kept the old label.
- **Rule:** a default the app wrote may be updated, and only while it still equals the old default exactly. The app
  never rewrites what the user wrote: field labels and values inside items, tags, and note pages.
- `migrateVaultMeta` in `packages/core/src/templates.ts` holds the list of renamed defaults. The sync engine applies
  it on every run and pushes `vault.json` when something changed. When a default label changes, add its old spelling
  to that list in the same change.
- **Rejected:** storing only the status id and taking the label from the app. Files would stop being readable
  without the app, and users could not rename a status.
- **Known gap:** a generated `readable/` copy of an item keeps the old label until that item is saved again. The
  index and the CSV are regenerated right away.

## D17. Internationalisation: any language, built in-house (2026-11-11)

- **UI strings.** `web/src/i18n/zh.ts` stays the source of keys and `en.ts` stays complete; both are bundled. Every
  other language is a `web/src/i18n/locales/<tag>.json` file, loaded on demand and listed in `EXTRA` in
  `languages.ts`. A translation may be incomplete: missing keys fall back along the tag (`pt-BR` → `pt` → `en`,
  `zh-TW` → `zh-Hant` → `zh` → `en`). Tests reject unknown keys, malformed messages and arguments English doesn't
  have; `pnpm i18n:report` lists what each language is missing. JSON was chosen because Weblate and Crowdin read it.
- **Message syntax** is a subset of ICU MessageFormat (`{name}` and `{n, plural, one {…} other {…}}`), parsed by
  `web/src/i18n/message.ts` and resolved with `Intl.PluralRules`. Plurals are needed for Russian, Polish, Arabic and
  others; English uses them too so that "1 files" never shows.
- **Rejected:** i18next or FormatJS. Both are larger than what is needed here, and the existing `t()` calls and the
  compile-time key check stay as they were.
- **Drive files.** `vault.json` `locale` accepts any tag and keeps tags it doesn't know (data-format.md). Strings
  written to the drive use `Localized` (zh and en inline); other languages translate them in
  `packages/core/src/locales/<tag>.ts`, keyed by the English text, and `pick` looks them up along the fallback chain.
  A test requires every table to cover every label. Path names go through `pickPath` and stay zh/en only, so adding
  a translation never moves an existing vault's files.
- **Shipped 2026-11-11:** zh-Hant, ja, ko, es, fr, de, pt-BR, it, ru, tr, vi and id, for both the UI and the drive
  labels. The labels are shipped together with the UI on purpose: they are copied into a vault at creation, so a
  vault created while a language only had UI translations would keep English labels for good (D16).
- **Pseudo-locale** `en-XA`, dev builds only: accents every letter and pads by 40%, to find strings that skipped
  `t()` and layouts that break with longer text.
- **Not done yet:** right-to-left layouts. `<html dir>` is already set, but the components still use physical
  Tailwind classes (`ml-`, `pr-`, `left-`). Switch them to logical ones (`ms-`, `pe-`, `start-`) before shipping
  Arabic, Hebrew or Persian. Smart paste still only recognises Chinese and English labels.
