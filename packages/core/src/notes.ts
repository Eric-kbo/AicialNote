import { generateKeyBetween } from 'fractional-indexing'
import { z } from 'zod'
import { fileStrings, pick } from './i18n'
import { ulid } from './ids'
import { FORMAT_VERSION, formatTag, type Item, parseWith } from './schema'

/**
 * Notebooks, sections and pages (OneNote-style). See docs/data-format.md.
 *
 * Every node is one file, `notes/<id>.json`. The tree is expressed by
 * `parentId` + `order`, never by folders, so moving or reordering a node
 * rewrites exactly one file.
 *
 *   notebook (parentId null)
 *   └── section (parentId = notebook)
 *       ├── page (parentId = section)
 *       │   └── page (parentId = page)  ← subpage, up to MAX_PAGE_DEPTH levels
 *       ├── accountList (parentId = section)
 *       │   └── account                  ← an item placed here (items/<id>.json → location)
 *       └── account
 *
 * Accounts are not stored in notes/. An item carries an optional `location`
 * and `buildTree` turns placed items into tree nodes of kind "account", so
 * moving, collapsing and deleting work the same for every row.
 */

export const NOTE_FORMAT = 'aicialnote.note'
/** Shares the vault-wide format version; see schema.ts. */
export const NOTE_FORMAT_VERSION = FORMAT_VERSION
/** Kinds stored in notes/<id>.json. */
export const NOTE_KINDS = ['notebook', 'section', 'page', 'accountList'] as const
export type StoredNoteKind = (typeof NOTE_KINDS)[number]
/** Kinds that appear in the tree; "account" nodes are derived from items. */
export type NoteKind = StoredNoteKind | 'account'

/** Colours a notebook or section can carry. Mapped to design tokens in the UI. */
export const NOTE_COLORS = ['gray', 'blue', 'green', 'yellow', 'red', 'purple'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

/** Page, subpage, sub-subpage. */
export const MAX_PAGE_DEPTH = 3

/**
 * Rich text, stored as a ProseMirror / Tiptap JSON document. Kept loose on
 * purpose: unknown node types survive a round trip.
 */
export const docSchema = z.looseObject({
  type: z.literal('doc'),
  content: z.array(z.looseObject({ type: z.string() })).optional(),
})
export type NoteDoc = z.infer<typeof docSchema>

export const noteSchema = z.looseObject({
  format: formatTag(NOTE_FORMAT, 'onlynote.note'),
  formatVersion: z.number().int().min(1),
  id: z.string().min(1),
  kind: z.enum(NOTE_KINDS),
  parentId: z.string().min(1).nullable(),
  /** Fractional index; siblings sort by plain string comparison. */
  order: z.string().min(1),
  title: z.string(),
  color: z.enum(NOTE_COLORS).optional().catch(undefined),
  /** Pages only. */
  content: docSchema.optional().catch(undefined),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})
/** A notes/ file as stored. */
export type NoteFile = z.infer<typeof noteSchema>
/** A tree node: a stored note, or an account derived from a placed item. */
// A mapped type rather than Omit<>: Omit on a loose (index-signature) type turns every key into `unknown`.
export type Note = { [K in keyof NoteFile]: K extends 'kind' ? NoteKind : NoteFile[K] }

export function emptyDoc(): NoteDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/** The tree node for a placed item, or null when the item isn't in any notebook. */
export function accountNode(item: Item): Note | null {
  if (!item.location) return null
  return {
    format: NOTE_FORMAT,
    formatVersion: NOTE_FORMAT_VERSION,
    id: item.id,
    kind: 'account',
    parentId: item.location.parentId,
    order: item.location.order,
    title: item.name || item.displayId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function createNote(input: {
  kind: StoredNoteKind
  parentId: string | null
  order: string
  title?: string
  color?: NoteColor
  content?: NoteDoc
  now?: Date
}): Note {
  const now = (input.now ?? new Date()).toISOString()
  const note: Note = {
    format: NOTE_FORMAT,
    formatVersion: NOTE_FORMAT_VERSION,
    id: ulid(),
    kind: input.kind,
    parentId: input.parentId,
    order: input.order,
    title: input.title ?? '',
    createdAt: now,
    updatedAt: now,
  }
  if (input.color) note.color = input.color
  if (input.kind === 'page') note.content = input.content ?? emptyDoc()
  return note
}

// --- ordering ----------------------------------------------------------------

/** Order key between two neighbours (either may be missing). */
export function orderBetween(before?: string | null, after?: string | null): string {
  const a = before ?? null
  const b = after ?? null
  try {
    return generateKeyBetween(a, b)
  } catch {
    // Two devices produced the same key, or a hand-edited file broke the
    // order. Fall back to "after the earlier one"; ties sort by id.
    const earlier = [a, b].filter((k): k is string => k !== null).sort()[0] ?? null
    return generateKeyBetween(earlier, null)
  }
}

export function compareNotes(a: Note, b: Note): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// --- tree --------------------------------------------------------------------

export interface NoteTree {
  byId: Map<string, Note>
  /** Sorted children per parent id; root notebooks under `null`. */
  children: Map<string | null, Note[]>
  /** Placed items, by id (the same ids as their "account" nodes). */
  items: Map<string, Item>
}

export function buildTree(stored: Note[], allItems: Item[] = []): NoteTree {
  const items = new Map<string, Item>()
  const notes = [...stored]
  for (const item of allItems) {
    const node = accountNode(item)
    if (!node) continue
    items.set(item.id, item)
    notes.push(node)
  }
  const byId = new Map(notes.map((n) => [n.id, n]))
  const children = new Map<string | null, Note[]>()
  for (const n of notes) {
    // A parent that no longer exists (deleted on another device) would hide
    // the node forever. Notebooks become roots; orphans are kept under their
    // dangling parent id so they can be found and rescued.
    const key = n.kind === 'notebook' ? null : n.parentId
    let list = children.get(key)
    if (!list) children.set(key, (list = []))
    list.push(n)
  }
  for (const list of children.values()) list.sort(compareNotes)
  return { byId, children, items }
}

export function childrenOf(tree: NoteTree, parentId: string | null): Note[] {
  return tree.children.get(parentId) ?? []
}

/** Ancestors from the root down, not including the node itself. */
export function ancestors(tree: NoteTree, id: string): Note[] {
  const out: Note[] = []
  const seen = new Set<string>()
  let cur = tree.byId.get(id)
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId)
    const parent = tree.byId.get(cur.parentId)
    if (!parent) break
    out.unshift(parent)
    cur = parent
  }
  return out
}

/** The section a page belongs to (walking up through parent pages). */
export function sectionOf(tree: NoteTree, id: string): Note | undefined {
  const node = tree.byId.get(id)
  if (node?.kind === 'section') return node
  return ancestors(tree, id)
    .reverse()
    .find((n) => n.kind === 'section')
}

export function notebookOf(tree: NoteTree, id: string): Note | undefined {
  const node = tree.byId.get(id)
  if (node?.kind === 'notebook') return node
  return ancestors(tree, id).find((n) => n.kind === 'notebook')
}

/** The node and everything below it, parents before children. */
export function subtree(tree: NoteTree, id: string): Note[] {
  const root = tree.byId.get(id)
  if (!root) return []
  const out: Note[] = []
  const walk = (n: Note) => {
    out.push(n)
    for (const c of childrenOf(tree, n.id)) walk(c)
  }
  walk(root)
  return out
}

/** 1 for a top-level page, 2 for a subpage … */
export function pageDepth(tree: NoteTree, id: string): number {
  let depth = 0
  let cur = tree.byId.get(id)
  while (cur?.kind === 'page') {
    depth++
    cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined
  }
  return depth
}

/** How many page levels hang below this page (0 when it has no subpages). */
export function pageHeight(tree: NoteTree, id: string): number {
  const kids = childrenOf(tree, id)
  return kids.length ? 1 + Math.max(...kids.map((k) => pageHeight(tree, k.id))) : 0
}

export interface PageRow {
  page: Note
  depth: number
  hasChildren: boolean
}

/** What the page list of a section shows: pages, account lists and accounts. */
const SECTION_ROW_KINDS = new Set<NoteKind>(['page', 'accountList', 'account'])

/** Rows of a section in display order, flattened with their depth. */
export function flattenPages(tree: NoteTree, sectionId: string, collapsed: ReadonlySet<string> = new Set()) {
  const rows: PageRow[] = []
  const walk = (parentId: string, depth: number) => {
    for (const page of childrenOf(tree, parentId)) {
      if (!SECTION_ROW_KINDS.has(page.kind)) continue
      const kids = childrenOf(tree, page.id)
      rows.push({ page, depth, hasChildren: kids.length > 0 })
      if (!collapsed.has(page.id)) walk(page.id, depth + 1)
    }
  }
  walk(sectionId, 0)
  return rows
}

/** Is `id` the same as, or below, `ancestorId`? Guards against cyclic moves. */
export function isWithin(tree: NoteTree, id: string, ancestorId: string): boolean {
  if (id === ancestorId) return true
  return ancestors(tree, id).some((a) => a.id === ancestorId)
}

// --- text ----------------------------------------------------------------------

interface PMNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  content?: PMNode[]
}

const BLOCKS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'tableRow',
  'horizontalRule',
])

/** Plain text of a page body, one line per block. Used for search and previews. */
export function docToText(doc: NoteDoc | undefined): string {
  if (!doc) return ''
  const out: string[] = []
  let line = ''
  const flush = () => {
    if (line.trim()) out.push(line.trim())
    line = ''
  }
  const walk = (n: PMNode) => {
    if (n.type === 'text') line += n.text ?? ''
    else if (n.type === 'hardBreak') line += ' '
    else if (n.type === 'tableCell' || n.type === 'tableHeader') {
      for (const c of n.content ?? []) walk(c)
      line += '  '
      return
    }
    for (const c of n.content ?? []) walk(c)
    if (BLOCKS.has(n.type)) flush()
  }
  walk(doc as PMNode)
  flush()
  return out.join('\n')
}

/** Lower-cased search haystack for a note. */
export function noteSearchText(note: Note): string {
  return `${note.title}\n${docToText(note.content)}`.toLowerCase()
}

function escapeMd(s: string) {
  return s.replace(/([\\`*_[\]#|<>])/g, '\\$1')
}

function inlineMd(nodes: PMNode[] | undefined): string {
  let out = ''
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out += '  \n'
      continue
    }
    if (n.type !== 'text') {
      out += inlineMd(n.content)
      continue
    }
    const marks = new Set((n.marks ?? []).map((m) => m.type))
    if (marks.has('code')) {
      out += `\`${n.text ?? ''}\``
      continue
    }
    let t = escapeMd(n.text ?? '')
    if (marks.has('bold')) t = `**${t}**`
    if (marks.has('italic')) t = `*${t}*`
    if (marks.has('strike')) t = `~~${t}~~`
    if (marks.has('highlight')) t = `==${t}==`
    const link = n.marks?.find((m) => m.type === 'link')
    if (link && typeof link.attrs?.href === 'string') t = `[${t}](${link.attrs.href})`
    out += t
  }
  return out
}

function blockMd(n: PMNode, indent: string): string[] {
  const kids = n.content ?? []
  switch (n.type) {
    case 'paragraph':
      return [indent + inlineMd(kids)]
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1))
      return [`${indent}${'#'.repeat(level + 1)} ${inlineMd(kids)}`]
    }
    case 'blockquote':
      return kids.flatMap((c) => blockMd(c, indent)).map((l) => `> ${l}`)
    case 'codeBlock': {
      const lang = typeof n.attrs?.language === 'string' ? n.attrs.language : ''
      const text = kids.map((c) => c.text ?? '').join('')
      return [`${indent}\`\`\`${lang}`, ...text.split('\n').map((l) => indent + l), `${indent}\`\`\``]
    }
    case 'horizontalRule':
      return [`${indent}---`]
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return kids.flatMap((item, i) => {
        const marker =
          n.type === 'orderedList'
            ? `${i + 1}. `
            : n.type === 'taskList'
              ? `- [${item.attrs?.checked ? 'x' : ' '}] `
              : '- '
        const [first = '', ...rest] = (item.content ?? []).flatMap((c, j) =>
          blockMd(c, j === 0 ? '' : `${indent}${' '.repeat(marker.length)}`),
        )
        return [`${indent}${marker}${first.trimStart()}`, ...rest]
      })
    case 'table': {
      const rows = kids.map((row) =>
        (row.content ?? []).map((cell) =>
          (cell.content ?? [])
            .map((p) => inlineMd(p.content))
            .join(' ')
            .replace(/\|/g, '\\|'),
        ),
      )
      if (!rows.length) return []
      const width = Math.max(...rows.map((r) => r.length))
      const line = (r: string[]) => `${indent}| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
      return [line(rows[0]!), `${indent}|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)]
    }
    default:
      return kids.length ? kids.flatMap((c) => blockMd(c, indent)) : []
  }
}

/** Markdown rendering of a page body. Headings start at `##` (the title is `#`). */
export function docToMarkdown(doc: NoteDoc | undefined): string {
  if (!doc) return ''
  const blocks = ((doc as PMNode).content ?? []).map((b) => blockMd(b, '').join('\n'))
  return blocks
    .filter((b, i) => b.trim() || (i > 0 && blocks[i - 1]?.trim()))
    .join('\n\n')
    .trim()
}

export function readableNoteFileName(note: Note): string {
  const title = note.title
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are invalid in file names
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '')
  const suffix = note.id.slice(-6)
  return title ? `${title} (${suffix}).md` : `${suffix}.md`
}

export function parseNote(text: string): NoteFile {
  return parseWith(noteSchema, text, 'Note')
}

/** Markdown copy of a page for `readable/`. `crumbs` are the ancestor titles. */
export function noteToMarkdown(note: Note, crumbs: string[], locale: string): string {
  const s = (k: keyof typeof fileStrings) => pick(fileStrings[k], locale)
  const lines = [`# ${note.title || s('untitled')}`, '']
  if (crumbs.length) lines.push(crumbs.join(' / '), '')
  const body = docToMarkdown(note.content)
  if (body) lines.push(body, '')
  lines.push('---', '', `<sub>${s('generatedNoticeNote')} \`notes/${note.id}.json\`</sub>`, '')
  return lines.join('\n')
}

// --- moves ---------------------------------------------------------------------

export type DropPosition = 'before' | 'after' | 'inside'

/** Which parent kinds a node may live under. */
function parentAllowed(kind: NoteKind, parent: Note | undefined): boolean {
  switch (kind) {
    case 'notebook':
      return parent === undefined
    case 'section':
      return parent?.kind === 'notebook'
    case 'page':
      return parent?.kind === 'section' || parent?.kind === 'page'
    case 'accountList':
      return parent?.kind === 'section'
    case 'account':
      return parent?.kind === 'section' || parent?.kind === 'accountList'
  }
}

/**
 * Where a node lands when dropped relative to `targetId`. Returns null when
 * the move is not allowed (wrong level, into itself, or too deep).
 */
export function planMove(
  tree: NoteTree,
  id: string,
  targetId: string,
  position: DropPosition,
): { parentId: string | null; order: string } | null {
  const node = tree.byId.get(id)
  const target = tree.byId.get(targetId)
  if (!node || !target || isWithin(tree, targetId, id)) return null

  const parent = position === 'inside' ? target : target.parentId ? tree.byId.get(target.parentId) : undefined
  if (!parentAllowed(node.kind, parent)) return null
  if (node.kind === 'page' && pageDepth(tree, parent!.id) + 1 + pageHeight(tree, id) > MAX_PAGE_DEPTH) return null

  const parentId = parent?.id ?? null
  const siblings = childrenOf(tree, parentId).filter((n) => n.id !== id)
  if (position === 'inside') {
    return { parentId, order: orderBetween(siblings.at(-1)?.order, null) }
  }
  const i = siblings.findIndex((n) => n.id === targetId)
  const order =
    position === 'before'
      ? orderBetween(siblings[i - 1]?.order, target.order)
      : orderBetween(target.order, siblings[i + 1]?.order)
  return { parentId, order }
}

/**
 * Make a page a subpage of the page above it (OneNote: "Make Subpage"), or
 * put an account into the account list above it.
 */
export function planIndent(tree: NoteTree, id: string) {
  const node = tree.byId.get(id)
  if (node?.kind !== 'page' && node?.kind !== 'account') return null
  const siblings = childrenOf(tree, node.parentId)
  const prev = siblings[siblings.findIndex((n) => n.id === id) - 1]
  return prev ? planMove(tree, id, prev.id, 'inside') : null
}

/** Move a subpage (or a listed account) up one level, right after its current parent. */
export function planOutdent(tree: NoteTree, id: string) {
  const node = tree.byId.get(id)
  const parent = node?.parentId ? tree.byId.get(node.parentId) : undefined
  const ok =
    (node?.kind === 'page' && parent?.kind === 'page') || (node?.kind === 'account' && parent?.kind === 'accountList')
  return ok ? planMove(tree, id, parent!.id, 'after') : null
}

/** Order key for a new last child. */
export function orderAtEnd(tree: NoteTree, parentId: string | null): string {
  return orderBetween(childrenOf(tree, parentId).at(-1)?.order, null)
}

/** Order key right after `id` among its siblings. */
export function orderAfter(tree: NoteTree, id: string): string {
  const node = tree.byId.get(id)
  if (!node) return orderBetween(null, null)
  const siblings = childrenOf(tree, node.kind === 'notebook' ? null : node.parentId)
  const next = siblings[siblings.findIndex((n) => n.id === id) + 1]
  return orderBetween(node.order, next?.order)
}
