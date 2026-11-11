# Design principles

AicialNote is a tool people open dozens of times a day to look something up and copy it. Every decision follows from that.

## 1. Reading and copying come first

- Clicking a value copies it. Editing is a double-click, the pencil, or Tab from the previous field.
- Secrets are masked but still copy with one click. 2FA fields show the live code, not the secret.
- Confirmation is inline and quiet: the row flashes and the action area says "Copied". No toasts for copying.

## 2. Writing should take seconds

- Smart paste is the main way in. Whatever text a colleague, an email or an old note holds gets turned into fields. The user only
  checks the result.
- Edits happen in place and save themselves. There is no edit mode and no Save button.
- Enter moves to the next _empty_ field, so a new card fills up fast. Tab moves to the next field, whatever it holds.

## 3. Undo instead of "Are you sure?"

Destructive actions happen right away and offer **Undo** for a few seconds. On the drive, nothing is ever lost anyway
(see [data-format.md](data-format.md)).

## 4. Dense, calm and keyboard-first

- Base size 14px, table rows 40px, 13px secondary text. Show a lot without feeling cramped.
- Neutral surfaces with a single accent colour (`--accent`). Status colours appear only on status.
- No gradients, no emoji, no drop shadows on resting surfaces, no decorative illustrations. Icons come from one
  line-icon set, plus small tinted tiles for card types.
- Every frequent action has a shortcut. `Ctrl/⌘ K` reaches everything.

## 5. Motion explains, never decorates

Animations stay under 200ms and only show cause and effect: a menu opening, a toast arriving, a copied row flashing.
`prefers-reduced-motion` turns them off.

## 6. Both languages and both themes are first-class

Chinese and English ship together. Every string goes through `src/i18n`. Light and dark use the same tokens. Check
both before merging UI work (`pnpm screenshots`).

## Tokens

Defined in `web/src/styles.css`. Use the semantic names, never raw colours:

| Token                                  | Use                                                             |
| -------------------------------------- | --------------------------------------------------------------- |
| `bg` / `surface` / `subtle`            | page, cards, secondary panels                                   |
| `hover` / `active`                     | interactive states                                              |
| `line` / `line-strong`                 | borders                                                         |
| `fg` / `fg-2` / `fg-3`                 | primary, secondary, tertiary text                               |
| `accent`, `accent-soft`                | the one accent                                                  |
| `st-green/blue/yellow/red/gray`        | status only                                                     |
| `nb-gray/blue/green/yellow/red/purple` | notebook and section colours only (the small tab and book icon) |

## Notes

- Three columns, like OneNote: notebooks and sections in the sidebar, the section's pages in the middle, the page on
  the right. Subpages are indented in the page list.
- The page body is a flowing document, not a free canvas. Formatting lives in one slim toolbar plus the `/` menu;
  Markdown shortcuts (`# `, `- `, `[] `, `> `) work as well.
- A page has no Save button either: the body saves on every pause, the title while typing.
- Rename in place (double-click or F2 in the sidebar, the title field for pages). Delete offers Undo.
