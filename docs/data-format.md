# Data format

AicialNote keeps **no data on any server**. Everything lives in one folder in the user's storage:

| Storage      | Folder                     |
| ------------ | -------------------------- |
| Google Drive | `My Drive/AicialNote`      |
| OneDrive     | `Apps/AicialNote`          |
| Local folder | the folder the user picked |

This document is the contract. Any tool that follows it can read and write an AicialNote vault, and the data must stay
readable with nothing but a text editor.

## Layout

```
AicialNote/
├── README.md                 explains the folder to a human who finds it
├── vault.json                settings
├── items/<id>.json           account data — one file per ID
├── notes/<id>.json           notebooks, sections and pages — one file per node
├── history/<id>/<time>.json  previous versions, written before every overwrite
├── trash/<id>.json           deleted IDs and notes
├── readable/<ID name>.md     generated, human-readable copy of each item
├── readable/笔记/<title>.md   generated Markdown copy of each page (folder name depends on the locale)
├── readable/全部账号.csv      generated overview (name depends on the vault locale)
└── index.json                generated summary
```

Only `vault.json`, `items/` and `notes/` are read back. Everything under `readable/`, plus `index.json`, is regenerated
and may be deleted at any time.

## Durability rules

1. **Nothing is overwritten without a copy.** Before `items/<id>.json` or `notes/<id>.json` is replaced, the previous
   content is written to `history/<id>/<UTC timestamp>.json` (for example `20261108T073632.123Z.json`; files written
   before notes existed have no milliseconds).
2. **Nothing is deleted without a copy.** Deleting an ID or a note writes `trash/<id>.json` first, then removes the
   file. Deleting a notebook or section does this for every node below it.
   Cloud adapters remove files by moving them to the provider's recycle bin.
3. **Conflicts never drop data.** Writes are conditional on the file's etag. If another device changed the file, the
   local version wins and the remote version is saved to `history/`.
4. **Newer formats are never overwritten.** A reader that finds `formatVersion` higher than it supports must stop
   writing and ask the user to update.
5. **Unknown keys are preserved.** Readers must keep keys they don't understand when writing an object back.

## Former name

The app was called OnlyNote until 2026-11-09. Files written before the rename carry `onlynote.vault`,
`onlynote.item` and `onlynote.note` as their `format`. Readers must accept them as equal to the `aicialnote.*` tags.
The app writes the new tag the next time it saves such a file. This doesn't bump `formatVersion`.

## `vault.json`

```json
{
  "format": "aicialnote.vault",
  "formatVersion": 1,
  "createdAt": "2026-11-06T12:00:00.000Z",
  "locale": "zh",
  "nextSeq": 14,
  "statuses": [
    { "id": "active", "label": "正常", "color": "green" },
    { "id": "warming", "label": "准备中", "color": "blue" }
  ]
}
```

| Key                | Meaning                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `locale`           | Any BCP 47 tag (`zh` = Simplified Chinese, `en`, `ja`, `pt-BR` …). See below.            |
| `nextSeq`          | Next number for display ids (`ID-0014`). Concurrent writers merge by taking the maximum. |
| `statuses[].color` | `green`, `blue`, `yellow`, `red` or `gray`.                                              |

The status list is written once, when the vault is created, and belongs to the vault from then on. Items refer to a
status by `id`, never by label.

Until 2026-11-11 the default label of `warming` was `养号中` (`Warming up` in English vaults). The app renames it to
`准备中` (`Setting up`) the next time it syncs, but only while the label still equals the old default exactly. A
label the user chose is never changed. This doesn't bump `formatVersion`.

`locale` is the UI language at the time the vault was created, and it is never changed afterwards. It picks the
language of the default status labels, the field labels of new cards and the CSV headers. These labels exist in
`zh`, `en`, `zh-Hant`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `it`, `ru`, `tr`, `vi` and `id`. Another language
falls back along its tag (`pt-PT` → `pt` → `en`, `zh-TW` → `zh-Hant`, `zh-SG` → `zh`) and ends at English. The
README is written in Chinese for any `zh*` tag and in English otherwise. Readers must keep a tag they don't know as written, never replace it. Until 2026-11-11 the only values were
`zh` and `en`, and a missing key still means `zh`; widening the values didn't bump `formatVersion`.

The two generated path names, `readable/全部账号.csv` and `readable/笔记/`, exist only in `zh` and `en`. Every other
language uses `all-items.csv` and `notes/`, so a later translation never moves the files of an existing vault.

## `items/<id>.json`

```json
{
  "format": "aicialnote.item",
  "formatVersion": 1,
  "id": "01JC9Z4M7K3V8Q2R5T6W9X0Y1Z",
  "displayId": "ID-0001",
  "name": "Linda Russo",
  "status": "active",
  "tags": ["家庭", "重要"],
  "cards": [
    {
      "id": "k3m9p2qa",
      "template": "google",
      "title": "Google",
      "fields": [
        {
          "id": "a1b2c3d4",
          "label": "邮箱",
          "type": "email",
          "role": "account",
          "value": "linda.russo.demo@gmail.com"
        },
        { "id": "e5f6g7h8", "label": "密码", "type": "password", "role": "password", "value": "…" },
        { "id": "j9k2m3n4", "label": "2FA", "type": "totp", "role": "totp", "value": "JBSWY3DPEHPK3PXP" }
      ]
    }
  ],
  "notes": "Free text, multiple lines.",
  "createdAt": "2026-11-06T12:00:00.000Z",
  "updatedAt": "2026-11-06T12:30:00.000Z"
}
```

| Key                | Meaning                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | [ULID](https://github.com/ulid/spec). Stable, never shown, used as the file name.                                                                                                            |
| `displayId`        | Human-friendly number shown in the UI. Not guaranteed unique across offline devices.                                                                                                         |
| `status`           | Id of an entry in `vault.json` → `statuses`.                                                                                                                                                 |
| `cards[].template` | Template the card was created from. Informational; cards are fully self-describing.                                                                                                          |
| `fields[].label`   | Shown to the user. Every field carries its own label so the file makes sense on its own.                                                                                                     |
| `fields[].type`    | `text`, `password`, `totp`, `email`, `phone`, `url`, `date`, `multiline`. Unknown types read as `text`.                                                                                      |
| `fields[].role`    | Optional meaning, used by smart paste and list summaries: `account`, `username`, `password`, `totp`, `recovery`, `phone`, `host`, `region`, `expires`, `url`, `name`, `birthday`, `address`. |
| `fields[].value`   | Always a string. `totp` holds a base32 secret or an `otpauth://` URI. `date` is `YYYY-MM-DD`.                                                                                                |
| `location`         | Optional. Where the item is filed in the notebooks: `{ "parentId": "<section or accountList id>", "order": "a1" }`. Absent means unfiled. See `notes/` below.                                |

Files are UTF-8 JSON with 2-space indentation and a trailing newline.

## `notes/<id>.json`

Notebooks, sections and pages, OneNote-style. Every node is its own file, and the tree is expressed by `parentId` and
`order` rather than by folders. Moving or reordering a node rewrites exactly one file, so two devices that reorganise
different parts of the tree never conflict.

```text
notebook   parentId: null
└── section    parentId: <notebook id>
    ├── page       parentId: <section id>
    │   └── page       parentId: <page id>   (subpage; at most 3 page levels)
    ├── accountList    parentId: <section id>
    │   └── (account)  items/<id>.json → location.parentId: <accountList id>
    └── (account)  items/<id>.json → location.parentId: <section id>
```

Accounts are **not** copied into `notes/`. An item is filed by its own optional `location` key, so its data exists
exactly once and keeps every account feature. Each item has at most one location. Deleting an account list or a
section never deletes the accounts in it: the app removes their `location` and they become unfiled. Readers that
don't know `accountList` (OnlyNote before 2026-11-08) skip those files without overwriting them.

```json
{
  "format": "aicialnote.note",
  "formatVersion": 1,
  "id": "01JCA2B7Q9W3E5R7T9Y1U3I5O7",
  "kind": "page",
  "parentId": "01JCA2B5M1N3B5V7C9X1Z3A5S7",
  "order": "a1",
  "title": "代理清单",
  "content": {
    "type": "doc",
    "content": [
      { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "洛杉矶" }] },
      {
        "type": "paragraph",
        "content": [
          { "type": "text", "text": "端口 " },
          { "type": "text", "text": "8080", "marks": [{ "type": "bold" }] }
        ]
      }
    ]
  },
  "createdAt": "2026-11-08T12:00:00.000Z",
  "updatedAt": "2026-11-08T12:30:00.000Z"
}
```

| Key        | Meaning                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`     | `notebook`, `section`, `page` or `accountList` (a titled, ordered group of accounts; it has no `content`).                                                                                                                                                                                                                                                                |
| `parentId` | `null` for notebooks; a notebook id for sections; a section or page id for pages; a section id for account lists. A node whose parent is missing is kept and shown again once the parent returns.                                                                                                                                                                         |
| `order`    | [Fractional index](https://github.com/rocicorp/fractional-indexing) among siblings. Siblings sort by plain string comparison, then by `id`. A new key between two neighbours never requires renumbering the others.                                                                                                                                                       |
| `color`    | Optional, notebooks and sections: `gray`, `blue`, `green`, `yellow`, `red`, `purple`.                                                                                                                                                                                                                                                                                     |
| `content`  | Pages only. A [ProseMirror](https://prosemirror.net/docs/guide/#doc) document as written by [Tiptap](https://tiptap.dev): node types `paragraph`, `heading`, `bulletList`, `orderedList`, `taskList`, `blockquote`, `codeBlock`, `table`, `horizontalRule`; marks `bold`, `italic`, `underline`, `strike`, `code`, `highlight`, `link`. Unknown node types are preserved. |

`readable/笔记/<title> (<last 6 chars of id>).md` holds a Markdown rendering of each page, with the notebook and
section path on its second line.

## Backup file (export)

**导出数据 / Export data** downloads one file, `AicialNote-backup-<YYYY-MM-DD>.json`. It is never written to the drive.

```json
{
  "format": "aicialnote.backup",
  "formatVersion": 1,
  "exportedAt": "2026-11-11T09:30:00.000Z",
  "meta": { "format": "aicialnote.vault", "…": "the vault.json content" },
  "items": [{ "format": "aicialnote.item", "…": "one entry per items/<id>.json, unchanged" }],
  "notes": [{ "format": "aicialnote.note", "…": "one entry per notes/<id>.json, unchanged" }]
}
```

Every entry is exactly the file it came from, so the backup can be taken apart by hand. It holds passwords and 2FA
secrets in plain text. The CSV export is the same table as `readable/全部账号.csv`, and it can't be imported.

**Import** accepts a backup, or single `items/<id>.json` / `notes/<id>.json` files (including copies from `trash/`,
whose `deletedAt` key is dropped on import). The rules (`packages/core/src/backup.ts → planImport`):

- Nothing is ever deleted. A record whose `id` is unknown is added.
- A record whose `id` exists is replaced only when the imported `updatedAt` is strictly newer. The replaced version is
  pushed to `history/` like any other edit.
- An added item whose `displayId` belongs to a different item gets the next free number. `nextSeq` is raised past
  every imported number.
- An item whose `location.parentId` exists neither locally nor in the import is added unfiled.
- Statuses the vault doesn't know are appended to `vault.json`.
- A file, or an entry inside a backup, with a newer `formatVersion` is refused.

## Versioning

`formatVersion` is bumped only for changes old readers can't handle safely. Adding optional keys does not bump it.
Writers upgrade files lazily, one at a time, when they are next saved.

## Encryption (planned)

Encryption will be an optional layer around the same files: each file becomes an envelope
`{ "format": "aicialnote.encrypted", "kdf": {…}, "iv": "…", "data": "…" }` whose plaintext is exactly the JSON above.
