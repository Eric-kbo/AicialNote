import { ConflictError, MemoryAdapter } from '@aicialnote/storage'
import { describe, expect, it } from 'vitest'
import { createItem } from '../src/item'
import { createNote, NOTE_FORMAT, parseNote } from '../src/notes'
import { paths, VaultRemote } from '../src/remote'
import {
  FORMAT_VERSION,
  ITEM_FORMAT,
  parseItem,
  parseVaultMeta,
  serialize,
  UnsupportedVersionError,
  VAULT_FORMAT,
} from '../src/schema'
import { createCard, createVaultMeta } from '../src/templates'

function sample() {
  const item = createItem({ seq: 1, name: 'Russo/Linda' })
  const card = createCard('google', 'zh')
  card.fields[0]!.value = 'russo@gmail.com'
  card.fields[1]!.value = 'pw, with "quotes"'
  item.cards.push(card)
  return item
}

describe('VaultRemote', () => {
  it('initialises a vault once and reuses an existing one', async () => {
    const storage = new MemoryAdapter()
    const a = await new VaultRemote(storage).initMeta(createVaultMeta('zh'))
    expect(a.created).toBe(true)
    expect(storage.paths()).toEqual(['README.md', 'vault.json'])
    const b = await new VaultRemote(storage).initMeta(createVaultMeta('en'))
    expect(b.created).toBe(false)
    expect(b.meta.locale).toBe('zh')
  })

  it('writes items with history and detects conflicts', async () => {
    const storage = new MemoryAdapter()
    const remote = new VaultRemote(storage)
    const item = sample()
    const etag1 = await remote.writeItem(item, { etag: null })
    const first = serialize(item)

    const etag2 = await remote.writeItem({ ...item, name: 'Renamed' }, { etag: etag1, previous: first })
    expect(storage.paths().filter((p) => p.startsWith('history/'))).toHaveLength(1)

    await expect(remote.writeItem(item, { etag: etag1 })).rejects.toBeInstanceOf(ConflictError)
    expect((await remote.readItem(item.id))!.etag).toBe(etag2)
    expect((await remote.listItems()).map((f) => f.id)).toEqual([item.id])
  })

  it('trashes items recoverably', async () => {
    const storage = new MemoryAdapter()
    const remote = new VaultRemote(storage)
    const item = sample()
    await remote.writeItem(item, { etag: null })
    await remote.trashItem(item)
    expect(storage.paths()).toEqual([paths.trash(item.id)])
    expect(storage.recycleBin.map((r) => r.path)).toEqual([paths.item(item.id)])
  })

  it('writes readable markdown, renaming on name change, and the CSV overview', async () => {
    const storage = new MemoryAdapter()
    const remote = new VaultRemote(storage)
    const meta = createVaultMeta('zh')
    const item = sample()
    const p1 = await remote.writeReadable(item, meta)
    expect(p1).toBe('readable/ID-0001 Russo Linda.md')
    const md = (await storage.read(p1))!.text
    expect(md).toContain('# ID-0001 · Russo/Linda')
    expect(md).toContain('- 邮箱：russo@gmail.com')
    expect(md).toContain('状态：正常')

    const p2 = await remote.writeReadable({ ...item, name: 'New' }, meta, p1)
    expect(storage.paths()).toEqual([p2])

    await remote.writeDerived([item], meta)
    const csv = (await storage.read('readable/全部账号.csv'))!.text
    expect(csv.startsWith('﻿ID,名称,状态,标签,Google · 邮箱')).toBe(true)
    expect(csv).toContain('"pw, with ""quotes"""')
    expect(storage.paths()).toContain('index.json')
  })
})

describe('schema', () => {
  it('preserves unknown keys and rejects newer formats', () => {
    const item = { ...sample(), futureKey: { a: 1 } }
    expect(parseItem(serialize(item))).toMatchObject({ futureKey: { a: 1 } })
    expect(() => parseItem(serialize({ ...item, formatVersion: FORMAT_VERSION + 1 }))).toThrow(UnsupportedVersionError)
  })

  it('reads files written under the old name (onlynote.*) and upgrades the tag', () => {
    const item = sample()
    expect(parseItem(JSON.stringify({ ...item, format: 'onlynote.item' })).format).toBe(ITEM_FORMAT)
    const meta = createVaultMeta('zh')
    expect(parseVaultMeta(JSON.stringify({ ...meta, format: 'onlynote.vault' })).format).toBe(VAULT_FORMAT)
    const note = createNote({ kind: 'page', parentId: 's', order: 'a0', title: 'P' })
    expect(parseNote(JSON.stringify({ ...note, format: 'onlynote.note' })).format).toBe(NOTE_FORMAT)
    expect(() => parseItem(JSON.stringify({ ...item, format: 'other.item' }))).toThrow()
  })
})
