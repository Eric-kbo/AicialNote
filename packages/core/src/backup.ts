import { z } from 'zod'
import { formatDisplayId } from './ids'
import { type Note, type NoteFile, noteSchema } from './notes'
import {
  FORMAT_VERSION,
  FormatError,
  formatTag,
  type Item,
  itemSchema,
  parseWith,
  type Status,
  statusSchema,
  type VaultMeta,
  vaultMetaSchema,
} from './schema'

/**
 * Export and import. See docs/data-format.md → "Backup file".
 *
 * A backup is one JSON file holding every item and every stored note, each
 * exactly as it sits in items/ and notes/. Import also accepts single
 * items/<id>.json and notes/<id>.json files, so anything in trash/ can be
 * brought back the same way.
 *
 * Import never deletes and never silently loses: an existing record is only
 * replaced by a strictly newer one, and the replaced version still reaches
 * history/ through the normal sync push.
 */

export const BACKUP_FORMAT = 'aicialnote.backup'

const backupSchema = z.looseObject({
  format: formatTag(BACKUP_FORMAT, 'onlynote.backup'),
  formatVersion: z.number().int().min(1),
  exportedAt: z.string(),
  meta: z.unknown().optional(),
  items: z.array(z.unknown()),
  notes: z.array(z.unknown()).default([]),
})

export interface Backup {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  exportedAt: string
  meta: VaultMeta
  items: Item[]
  notes: NoteFile[]
}

export function createBackup(input: { meta: VaultMeta; items: Item[]; notes: Note[]; now?: Date }): Backup {
  const byDisplayId = [...input.items].sort((a, b) => a.displayId.localeCompare(b.displayId))
  return {
    format: BACKUP_FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    meta: input.meta,
    items: byDisplayId,
    // The tree only ever stores real notes; derived "account" nodes never reach a backup.
    notes: input.notes.filter((n): n is NoteFile => n.kind !== 'account'),
  }
}

/** What one or more chosen files contain. */
export interface ImportSource {
  items: Item[]
  notes: NoteFile[]
  statuses: Status[]
  /** Entries that could not be read (bad shape, newer format). */
  invalid: number
}

export function emptySource(): ImportSource {
  return { items: [], notes: [], statuses: [], invalid: 0 }
}

/**
 * Reads a backup, a single item file or a single note file. Throws
 * `FormatError` (or `UnsupportedVersionError`) when the file as a whole is not
 * something AicialNote wrote.
 */
export function parseImport(text: string): ImportSource {
  const raw = parseWith(z.looseObject({ format: z.string() }), text, 'File')
  const format = raw.format
  const out = emptySource()
  if (format === BACKUP_FORMAT || format === 'onlynote.backup') {
    const backup = parseWith(backupSchema, text, 'Backup')
    for (const entry of backup.items) {
      const r = readEntry(itemSchema, entry)
      if (r) out.items.push(restored(r))
      else out.invalid++
    }
    for (const entry of backup.notes) {
      const r = readEntry(noteSchema, entry)
      if (r) out.notes.push(restored(r))
      else out.invalid++
    }
    const meta = vaultMetaSchema.safeParse(backup.meta)
    if (meta.success) out.statuses = meta.data.statuses
    else if (Array.isArray((backup.meta as { statuses?: unknown })?.statuses)) {
      for (const s of (backup.meta as { statuses: unknown[] }).statuses) {
        const r = statusSchema.safeParse(s)
        if (r.success) out.statuses.push(r.data)
      }
    }
    return out
  }
  if (format === 'aicialnote.item' || format === 'onlynote.item') {
    out.items.push(restored(parseWith(itemSchema, text, 'Item')))
    return out
  }
  if (format === 'aicialnote.note' || format === 'onlynote.note') {
    out.notes.push(restored(parseWith(noteSchema, text, 'Note')))
    return out
  }
  throw new FormatError(`Unknown file format "${format}"`, text)
}

/** A copy from trash/ carries `deletedAt`; once imported it is live again. */
function restored<T extends object>(record: T): T {
  if (!('deletedAt' in record)) return record
  const { deletedAt: _, ...rest } = record as T & { deletedAt: unknown }
  return rest as T
}

function readEntry<T>(schema: z.ZodType<T>, entry: unknown): T | null {
  const version = (entry as { formatVersion?: unknown })?.formatVersion
  if (typeof version === 'number' && version > FORMAT_VERSION) return null
  const r = schema.safeParse(entry)
  return r.success ? r.data : null
}

/** Merges several parsed files. When the same id appears twice, the newer copy wins. */
export function mergeSources(sources: ImportSource[]): ImportSource {
  const items = new Map<string, Item>()
  const notes = new Map<string, NoteFile>()
  const statuses = new Map<string, Status>()
  let invalid = 0
  for (const s of sources) {
    for (const i of s.items) {
      const cur = items.get(i.id)
      if (!cur || i.updatedAt > cur.updatedAt) items.set(i.id, i)
    }
    for (const n of s.notes) {
      const cur = notes.get(n.id)
      if (!cur || n.updatedAt > cur.updatedAt) notes.set(n.id, n)
    }
    for (const st of s.statuses) if (!statuses.has(st.id)) statuses.set(st.id, st)
    invalid += s.invalid
  }
  return { items: [...items.values()], notes: [...notes.values()], statuses: [...statuses.values()], invalid }
}

export interface ImportPlan {
  addItems: Item[]
  updateItems: Item[]
  addNotes: NoteFile[]
  updateNotes: NoteFile[]
  /** Already present and identical, or the local copy is newer. */
  skipped: number
  invalid: number
  /** Statuses the vault doesn't know yet. */
  addStatuses: Status[]
  /** The vault's next display-id number after the import. */
  nextSeq: number
}

export function planImport(local: { items: Item[]; notes: Note[]; meta: VaultMeta }, source: ImportSource): ImportPlan {
  const localItems = new Map(local.items.map((i) => [i.id, i]))
  const localNotes = new Map(local.notes.map((n) => [n.id, n]))
  const plan: ImportPlan = {
    addItems: [],
    updateItems: [],
    addNotes: [],
    updateNotes: [],
    skipped: 0,
    invalid: source.invalid,
    addStatuses: [],
    nextSeq: local.meta.nextSeq,
  }

  for (const note of source.notes) {
    const cur = localNotes.get(note.id)
    if (!cur) plan.addNotes.push(note)
    else if (same(cur, note) || note.updatedAt <= cur.updatedAt) plan.skipped++
    else plan.updateNotes.push(note)
  }

  // A location that points at a list or section that exists neither here nor
  // in the import would hide the account; file it as "unfiled" instead.
  const noteIds = new Set([...localNotes.keys(), ...source.notes.map((n) => n.id)])
  const placeable = (item: Item): Item => {
    if (!item.location || noteIds.has(item.location.parentId)) return item
    const copy = structuredClone(item)
    delete copy.location
    return copy
  }

  const takenDisplayIds = new Map(local.items.map((i) => [i.displayId, i.id]))
  let maxSeq = 0
  for (const item of source.items) maxSeq = Math.max(maxSeq, seqOf(item.displayId))
  let nextSeq = Math.max(local.meta.nextSeq, maxSeq + 1)

  // Oldest first, so renumbered ids stay in creation order.
  const incoming = [...source.items].sort((a, b) => a.displayId.localeCompare(b.displayId))
  for (const raw of incoming) {
    const item = placeable(raw)
    const cur = localItems.get(item.id)
    if (cur) {
      if (same(cur, item) || item.updatedAt <= cur.updatedAt) plan.skipped++
      // Same record from another device: keep the number people already know it by.
      else plan.updateItems.push({ ...item, displayId: cur.displayId })
      continue
    }
    const owner = takenDisplayIds.get(item.displayId)
    const fresh = owner && owner !== item.id ? { ...item, displayId: formatDisplayId(nextSeq++) } : item
    takenDisplayIds.set(fresh.displayId, fresh.id)
    plan.addItems.push(fresh)
  }
  plan.nextSeq = nextSeq

  const knownStatuses = new Set(local.meta.statuses.map((s) => s.id))
  for (const s of source.statuses) {
    if (knownStatuses.has(s.id)) continue
    knownStatuses.add(s.id)
    plan.addStatuses.push(s)
  }
  return plan
}

export function planIsEmpty(plan: ImportPlan): boolean {
  return (
    plan.addItems.length + plan.updateItems.length + plan.addNotes.length + plan.updateNotes.length === 0 &&
    plan.addStatuses.length === 0
  )
}

function seqOf(displayId: string): number {
  const m = displayId.match(/^ID-(\d+)$/)
  return m ? Number(m[1]) : 0
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
