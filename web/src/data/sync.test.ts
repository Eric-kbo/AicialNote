import 'fake-indexeddb/auto'
import { createItem, type Item, VaultRemote } from '@aicialnote/core'
import { GoogleDriveAdapter, MemoryAdapter, type StorageAdapter } from '@aicialnote/storage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultDB } from './db'
import { ensureLocalMeta, SyncEngine } from './sync'

afterEach(() => vi.unstubAllGlobals())

interface DriveFile {
  id: string
  name: string
  parent: string
  folder: boolean
  text: string
  version: number
  modified: number
}

/** A small fake of the Drive v3 API. Like the real one, it allows two files with the same name in a folder. */
function fakeDrive() {
  let n = 0
  let clock = 0
  const files = new Map<string, DriveFile>()
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  const view = (f: DriveFile) => ({
    id: f.id,
    name: f.name,
    version: String(f.version),
    modifiedTime: new Date(f.modified).toISOString(),
  })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    // Every request takes a turn of the event loop, so two engines interleave as they do over a network.
    await new Promise((r) => setTimeout(r, 0))
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : ''
    const q = url.searchParams.get('q')
    if (method === 'GET' && url.pathname === '/drive/v3/files' && q) {
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1])
      const name = q.match(/name = '([^']+)'/)?.[1]
      const wantFolder = q.includes("mimeType = 'application/vnd.google-apps.folder'")
      const found = [...files.values()].filter(
        (f) => parents.includes(f.parent) && (!name || f.name === name) && f.folder === wantFolder,
      )
      // Drive promises no order for a plain listing. Newest first puts a stale twin last, the harder case.
      found.sort((a, b) => b.modified - a.modified)
      return json({ files: found.map(view) })
    }
    if (method === 'POST' && url.pathname === '/drive/v3/files') {
      const meta = JSON.parse(body)
      const id = `f${++n}`
      files.set(id, {
        id,
        name: meta.name,
        parent: meta.parents[0],
        folder: true,
        text: '',
        version: ++clock,
        modified: clock,
      })
      return json({ id })
    }
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      const meta = JSON.parse(body.split('\r\n\r\n')[1]!.split('\r\n')[0]!)
      const text = body.split('\r\n\r\n').slice(2).join('\r\n\r\n').split('\r\n--')[0]!
      const id = `f${++n}`
      const f = { id, name: meta.name, parent: meta.parents[0], folder: false, text, version: ++clock, modified: clock }
      files.set(id, f)
      return json(view(f))
    }
    const f = files.get(url.pathname.split('/').pop()!)
    if (!f) return new Response('', { status: 404 })
    if (method === 'PATCH' && url.pathname.startsWith('/upload/')) {
      f.text = body
      // Versions of two files rarely coincide on the real service; here they never do.
      f.version = ++clock
      f.modified = clock
      return json(view(f))
    }
    if (url.searchParams.get('alt') === 'media') return new Response(f.text)
    return json({ version: String(f.version), trashed: false })
  })
  return { files, named: (name: string) => [...files.values()].filter((f) => f.name === name) }
}

/** Web Locks as browsers provide them: one holder per name, the rest wait in line. */
function stubLocks() {
  const tails = new Map<string, Promise<unknown>>()
  const request = (name: string, fn: () => Promise<unknown>) => {
    const run = (tails.get(name) ?? Promise.resolve()).then(fn)
    tails.set(
      name,
      run.catch(() => {}),
    )
    return run
  }
  vi.stubGlobal('navigator', { onLine: true, locks: { request } })
}

let dbCount = 0

/** One browser tab: its own engine and storage adapter, on a cache that other tabs of the same vault share. */
async function openTab(name: string, storage: StorageAdapter) {
  const db = new VaultDB(name)
  await ensureLocalMeta(db, 'en')
  const engine = new SyncEngine(db, new VaultRemote(storage))
  return { db, engine }
}

async function edit(db: VaultDB, id: string, recipe: (item: Item) => void) {
  await db.transaction('rw', db.items, db.outbox, async () => {
    const item = (await db.items.get(id)) ?? createItem({ seq: 1 })
    item.id = id
    recipe(item)
    await db.items.put(item)
    await db.outbox.add({ key: `item:${id}`, op: 'put' })
  })
}

describe('SyncEngine with two tabs on one vault', () => {
  it('does not create the same file twice on Google Drive, and a later edit is not reverted', async () => {
    const drive = fakeDrive()
    stubLocks()
    const name = `test-${++dbCount}`
    const token = async () => 'tok'
    const a = await openTab(name, new GoogleDriveAdapter(token))
    const b = await openTab(name, new GoogleDriveAdapter(token))

    await edit(a.db, 'acc1', (d) => {
      d.name = 'old secret'
    })
    await Promise.all([a.engine.run(), b.engine.run()])
    expect(a.engine.getStatus().phase).toBe('idle')
    expect(b.engine.getStatus().phase).toBe('idle')
    expect(drive.named('acc1.json')).toHaveLength(1)
    expect(drive.named('vault.json')).toHaveLength(1)

    await edit(a.db, 'acc1', (d) => {
      d.name = 'new secret'
    })
    await a.engine.run()
    await b.engine.run()
    await a.engine.run()
    expect((await a.db.items.get('acc1'))!.name).toBe('new secret')
  })

  it('reads twin folders and twin files on Drive as one, so no account disappears and no edit is reverted', async () => {
    const drive = fakeDrive()
    const name = `test-${++dbCount}`
    const token = async () => 'tok'
    // No lock: this is what two tabs did before they took turns.
    const before = [
      await openTab(name, new GoogleDriveAdapter(token)),
      await openTab(name, new GoogleDriveAdapter(token)),
    ]
    await edit(before[0]!.db, 'acc1', (d) => {
      d.name = 'old secret'
    })
    await Promise.all(before.map((tab) => tab.engine.run()))
    expect(drive.named('acc1.json')).toHaveLength(2)
    expect(drive.named('items')).toHaveLength(2)
    // Each tab keeps writing into the folder it made, so the accounts end up spread over both.
    for (const [i, tab] of before.entries()) {
      await edit(tab.db, `only${i}`, (d) => {
        d.name = `only in folder ${i}`
      })
      await tab.engine.run()
    }
    const folders = new Set(['only0.json', 'only1.json'].map((file) => drive.named(file)[0]!.parent))
    expect(folders.size).toBe(2)

    // The same two tabs after a reload.
    const a = await openTab(name, new GoogleDriveAdapter(token))
    const b = await openTab(name, new GoogleDriveAdapter(token))

    await a.engine.run()
    await b.engine.run()
    expect((await a.db.items.toArray()).map((i) => i.id).sort()).toEqual(['acc1', 'only0', 'only1'])

    for (const round of [1, 2, 3]) {
      await edit(a.db, 'acc1', (d) => {
        d.name = `new secret ${round}`
      })
      // Whichever tab syncs, the edit stays.
      for (const tab of [a, b, a, b]) {
        await tab.engine.run()
        expect((await a.db.items.get('acc1'))!.name).toBe(`new secret ${round}`)
      }
    }
  })

  it('does not put a remote copy over an item that another tab pushed while the copy was being read', async () => {
    const storage = new MemoryAdapter()
    const name = `test-${++dbCount}`
    const a = await openTab(name, storage)
    await edit(a.db, 'acc1', (d) => {
      d.name = 'old secret'
    })
    await a.engine.run()

    // Another device writes the file, so tab B has a reason to read it.
    const other = JSON.parse((await storage.read('items/acc1.json'))!.text)
    await storage.write('items/acc1.json', JSON.stringify({ ...other, name: 'from another device' }))

    // Tab B reads the file. Before the answer arrives, the user edits in tab A and tab A pushes.
    let release = () => {}
    const held = new Promise<void>((r) => {
      release = r
    })
    const slow: StorageAdapter = {
      kind: storage.kind,
      list: (dir) => storage.list(dir),
      write: (path, text, options) => storage.write(path, text, options),
      remove: (path) => storage.remove(path),
      read: async (path) => {
        const result = await storage.read(path)
        if (path === 'items/acc1.json') await held
        return result
      },
    }
    const b = await openTab(name, slow)
    const pulling = b.engine.run()
    await new Promise((r) => setTimeout(r, 20))
    await edit(a.db, 'acc1', (d) => {
      d.name = 'new secret'
    })
    await a.engine.run()
    release()
    await pulling

    expect((await a.db.items.get('acc1'))!.name).toBe('new secret')
    expect(JSON.parse((await storage.read('items/acc1.json'))!.text).name).toBe('new secret')
  })
})
