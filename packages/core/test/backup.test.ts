import { describe, expect, it } from 'vitest'
import { createBackup, mergeSources, parseImport, planImport, planIsEmpty } from '../src/backup'
import { createItem } from '../src/item'
import { createNote } from '../src/notes'
import { FormatError, serialize, UnsupportedVersionError } from '../src/schema'
import { createVaultMeta } from '../src/templates'

const t0 = new Date('2026-01-01T00:00:00Z')
const t1 = new Date('2026-02-01T00:00:00Z')

function vault() {
  const meta = { ...createVaultMeta('zh', t0), nextSeq: 3 }
  const a = createItem({ seq: 1, name: 'A', now: t0 })
  const b = createItem({ seq: 2, name: 'B', now: t0 })
  const nb = createNote({ kind: 'notebook', parentId: null, order: 'a0', title: 'NB', now: t0 })
  return { meta, items: [a, b], notes: [nb] }
}

describe('backup', () => {
  it('round-trips through a file', () => {
    const v = vault()
    const text = serialize(createBackup(v))
    const src = parseImport(text)
    expect(src.items.map((i) => i.name)).toEqual(['A', 'B'])
    expect(src.notes.map((n) => n.title)).toEqual(['NB'])
    expect(src.statuses.length).toBe(v.meta.statuses.length)
    expect(src.invalid).toBe(0)
    // Importing into the same vault changes nothing.
    expect(planIsEmpty(planImport(v, src))).toBe(true)
    expect(planImport(v, src).skipped).toBe(3)
  })

  it('keeps unknown keys', () => {
    const v = vault()
    const backup = createBackup(v)
    ;(backup.items[0] as Record<string, unknown>).future = { x: 1 }
    const src = parseImport(serialize(backup))
    expect((src.items[0] as Record<string, unknown>).future).toEqual({ x: 1 })
  })

  it('accepts single item and note files', () => {
    const v = vault()
    expect(parseImport(serialize(v.items[0])).items).toHaveLength(1)
    expect(parseImport(serialize(v.notes[0])).notes).toHaveLength(1)
    const fromTrash = parseImport(serialize({ ...v.items[0], deletedAt: t1.toISOString() })).items[0]
    expect(fromTrash && 'deletedAt' in fromTrash).toBe(false)
    expect(() => parseImport('{"format":"something.else"}')).toThrow(FormatError)
    expect(() => parseImport('not json')).toThrow(FormatError)
  })

  it('refuses a newer format, and skips newer entries inside a backup', () => {
    const v = vault()
    const backup = createBackup(v)
    expect(() => parseImport(serialize({ ...backup, formatVersion: 99 }))).toThrow(UnsupportedVersionError)
    ;(backup.items[1] as { formatVersion: number }).formatVersion = 99
    const src = parseImport(serialize(backup))
    expect(src.items).toHaveLength(1)
    expect(src.invalid).toBe(1)
  })
})

describe('planImport', () => {
  it('replaces only with strictly newer copies', () => {
    const v = vault()
    const newer = { ...v.items[0]!, name: 'A2', updatedAt: t1.toISOString() }
    const older = { ...v.items[1]!, name: 'B-old', updatedAt: '2025-01-01T00:00:00.000Z' }
    const plan = planImport(v, { items: [newer, older], notes: [], statuses: [], invalid: 0 })
    expect(plan.updateItems.map((i) => i.name)).toEqual(['A2'])
    expect(plan.skipped).toBe(1)
  })

  it('renumbers display ids that are taken by another item', () => {
    const v = vault()
    const other = createItem({ seq: 1, name: 'From elsewhere', now: t0 })
    const far = createItem({ seq: 10, name: 'Far', now: t0 })
    const plan = planImport(v, { items: [other, far], notes: [], statuses: [], invalid: 0 })
    const byName = Object.fromEntries(plan.addItems.map((i) => [i.name, i.displayId]))
    expect(byName.Far).toBe('ID-0010')
    expect(byName['From elsewhere']).toBe('ID-0011')
    expect(plan.nextSeq).toBe(12)
  })

  it('unfiles accounts whose list exists nowhere', () => {
    const v = vault()
    const lost = createItem({ seq: 5, name: 'Lost', now: t0 })
    lost.location = { parentId: 'missing', order: 'a0' }
    const kept = createItem({ seq: 6, name: 'Kept', now: t0 })
    kept.location = { parentId: v.notes[0]!.id, order: 'a0' }
    const plan = planImport(v, { items: [lost, kept], notes: [], statuses: [], invalid: 0 })
    expect(plan.addItems.find((i) => i.name === 'Lost')?.location).toBeUndefined()
    expect(plan.addItems.find((i) => i.name === 'Kept')?.location?.parentId).toBe(v.notes[0]!.id)
  })

  it('adds unknown statuses and merges duplicate files by newest', () => {
    const v = vault()
    const a = { ...v.items[0]!, name: 'old', updatedAt: t1.toISOString() }
    const b = { ...v.items[0]!, name: 'new', updatedAt: '2026-03-01T00:00:00.000Z' }
    const src = mergeSources([
      { items: [a], notes: [], statuses: [{ id: 'custom', label: 'Custom', color: 'blue' }], invalid: 0 },
      { items: [b], notes: [], statuses: [], invalid: 1 },
    ])
    const plan = planImport(v, src)
    expect(plan.updateItems.map((i) => i.name)).toEqual(['new'])
    expect(plan.addStatuses.map((s) => s.id)).toEqual(['custom'])
    expect(plan.invalid).toBe(1)
  })
})
