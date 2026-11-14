import {
  ancestors,
  buildTree,
  createVaultMeta,
  FORMAT_VERSION,
  FormatError,
  type Item,
  migrateVaultMeta,
  type Note,
  parseItem,
  parseNote,
  paths,
  serialize,
  UnsupportedVersionError,
  type VaultMeta,
  type VaultRemote,
} from '@aicialnote/core'
import { AuthError, ConflictError, ScopeError, StorageError } from '@aicialnote/storage'
import type { OutboxEntry, VaultDB } from './db'

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error' | 'auth' | 'blocked'

export interface SyncStatus {
  phase: SyncPhase
  lastSyncedAt?: number
  error?: string
  /** With phase 'auth': signed in, but file access was declined at consent. */
  missingScope?: boolean
}

/** `name` is a display id for items and a title for notes. */
export type SyncEvent = { type: 'conflict'; name: string } | { type: 'corrupt'; path: string }

const PULL_INTERVAL = 60_000
const RETRY_DELAY = 20_000

/**
 * Mirrors the local cache to the drive.
 *
 * Order of every run: make sure vault.json exists → push local changes →
 * pull remote changes → regenerate index/CSV if anything was pushed.
 *
 * Safety rules:
 * - Before an item file is overwritten, its previous content goes to history/.
 * - On a conflict (someone else changed the file) the local version wins and
 *   the remote version is kept in history/ — nothing is dropped.
 * - Files written by a newer app version are never overwritten.
 */
export class SyncEngine {
  private status: SyncStatus = { phase: 'idle' }
  private listeners = new Set<() => void>()
  private running = false
  private again = false
  private derivedDirty = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private interval: ReturnType<typeof setInterval> | undefined
  private stopped = false

  constructor(
    private readonly db: VaultDB,
    private readonly remote: VaultRemote,
    private readonly onEvent: (e: SyncEvent) => void = () => {},
  ) {}

  // --- lifecycle ---------------------------------------------------------------

  start() {
    this.stopped = false
    this.schedule(0)
    this.interval = setInterval(() => this.schedule(0), PULL_INTERVAL)
    window.addEventListener('online', this.onWake)
    document.addEventListener('visibilitychange', this.onWake)
  }

  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    clearInterval(this.interval)
    window.removeEventListener('online', this.onWake)
    document.removeEventListener('visibilitychange', this.onWake)
  }

  private onWake = () => {
    if (document.visibilityState === 'visible') this.schedule(0)
  }

  /** Debounced: many quick edits become one sync run. */
  schedule(delay = 700) {
    if (this.stopped) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), delay)
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getStatus = () => this.status

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch }
    for (const fn of this.listeners) fn()
  }

  // --- run -------------------------------------------------------------------

  async run(): Promise<void> {
    if (this.running) {
      this.again = true
      return
    }
    if (this.status.phase === 'blocked') return
    this.running = true
    this.set({ phase: 'syncing' })
    try {
      do {
        this.again = false
        await this.ensureMeta()
        await this.migrateMeta()
        if (await this.push()) this.derivedDirty = true
        await this.pull()
        if (this.derivedDirty) await this.writeDerived()
      } while (this.again && !this.stopped)
      this.set({ phase: 'idle', lastSyncedAt: Date.now(), error: undefined, missingScope: undefined })
    } catch (err) {
      console.error('[sync]', err)
      if (err instanceof AuthError)
        this.set({ phase: 'auth', error: undefined, missingScope: err instanceof ScopeError || undefined })
      else if (err instanceof UnsupportedVersionError) this.set({ phase: 'blocked', error: err.message })
      else if (!navigator.onLine || (err instanceof StorageError && err.status === 0)) {
        this.set({ phase: 'offline', error: undefined })
        this.schedule(RETRY_DELAY)
      } else {
        this.set({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
        this.schedule(RETRY_DELAY)
      }
    } finally {
      this.running = false
    }
  }

  // --- meta ------------------------------------------------------------------

  private async localMeta() {
    const rec = await this.db.meta.get('meta')
    if (!rec) throw new Error('vault meta missing')
    return rec
  }

  /** Adopts an existing vault.json or creates one. */
  private async ensureMeta() {
    const rec = await this.localMeta()
    if (rec.etag !== null) return
    const loaded = await this.remote.loadMeta()
    if (loaded) {
      const nextSeq = Math.max(loaded.meta.nextSeq, rec.meta.nextSeq)
      await this.db.meta.put({ key: 'meta', meta: { ...loaded.meta, nextSeq }, etag: loaded.etag })
      if (nextSeq !== loaded.meta.nextSeq) await this.db.outbox.add({ key: 'meta', op: 'put' })
      return
    }
    const created = await this.remote.initMeta(rec.meta)
    await this.db.meta.put({ key: 'meta', meta: created.meta, etag: created.etag })
  }

  /**
   * Renames defaults that an earlier version wrote into vault.json and queues the file for a push. Returns
   * whether anything changed.
   */
  private migrateMeta(): Promise<boolean> {
    return this.db.transaction('rw', this.db.meta, this.db.outbox, async () => {
      const rec = await this.localMeta()
      const meta = migrateVaultMeta(rec.meta)
      if (meta === rec.meta) return false
      await this.db.meta.put({ ...rec, meta })
      await this.db.outbox.add({ key: 'meta', op: 'put' })
      return true
    })
  }

  private async pushMeta() {
    const rec = await this.localMeta()
    let saved: VaultMeta = rec.meta
    let etag: string
    try {
      etag = await this.remote.saveMeta(rec.meta, rec.etag)
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err
      const loaded = await this.remote.loadMeta()
      if (!loaded) throw err
      saved = migrateVaultMeta({ ...loaded.meta, nextSeq: Math.max(loaded.meta.nextSeq, rec.meta.nextSeq) })
      etag = await this.remote.saveMeta(saved, loaded.etag)
    }
    await this.db.transaction('rw', this.db.meta, async () => {
      const cur = await this.localMeta()
      const changedMeanwhile = serialize(cur.meta) !== serialize(rec.meta)
      const meta = changedMeanwhile ? { ...cur.meta, nextSeq: Math.max(cur.meta.nextSeq, saved.nextSeq) } : saved
      await this.db.meta.put({ key: 'meta', meta, etag })
    })
  }

  // --- push ------------------------------------------------------------------

  private async push(): Promise<boolean> {
    const entries = await this.db.outbox.orderBy('seq').toArray()
    if (entries.length === 0) return false
    // Only the newest entry per key matters: three edits become one write.
    const latest = new Map<string, OutboxEntry & { seq: number }>()
    for (const e of entries) latest.set(e.key, { ...e, seq: e.seq ?? 0 })

    for (const [key, entry] of latest) {
      if (key === 'meta') await this.pushMeta()
      else if (key.startsWith('note:')) {
        const id = key.slice('note:'.length)
        if (entry.op === 'put') await this.pushNote(id)
        else await this.pushNoteDelete(id, entry.snapshot as Note | undefined)
      } else {
        const id = key.slice('item:'.length)
        if (entry.op === 'put') await this.pushItem(id)
        else await this.pushDelete(id, entry.snapshot as Item | undefined)
      }
      await this.db.outbox
        .where('key')
        .equals(key)
        .and((e) => (e.seq ?? 0) <= entry.seq)
        .delete()
    }
    return true
  }

  private async pushItem(id: string) {
    const item = await this.db.items.get(id)
    if (!item) return
    const rec = await this.db.sync.get(id)
    const { meta } = await this.localMeta()
    let etag: string
    try {
      etag = await this.remote.writeItem(item, { etag: rec?.etag ?? null, previous: rec?.base })
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err
      // Someone else changed (or deleted) the file. Keep theirs in history/, ours wins.
      const current = await this.remote.storage.read(paths.item(id))
      if (current) {
        guardNewer(current.text)
        etag = await this.remote.writeItem(item, { etag: current.etag, previous: current.text })
        this.onEvent({ type: 'conflict', name: item.displayId })
      } else {
        etag = await this.remote.writeItem(item, { etag: null })
      }
    }

    let readablePath = rec?.readablePath
    try {
      readablePath = await this.remote.writeReadable(item, meta, rec?.readablePath)
    } catch (err) {
      // The readable copy is a convenience; never block the real data on it.
      console.warn('[sync] readable copy failed', err)
    }
    await this.db.sync.put({ id, etag, base: serialize(item), readablePath })
  }

  private async pushDelete(id: string, snapshot?: Item) {
    const rec = await this.db.sync.get(id)
    if (!rec) return // never reached the drive
    const item = snapshot ?? parseItem(rec.base)
    await this.remote.trashItem(item)
    if (rec.readablePath) await this.remote.removeReadable(rec.readablePath).catch(() => {})
    await this.db.sync.delete(id)
  }

  private async pushNote(id: string) {
    const note = await this.db.notes.get(id)
    if (!note) return
    const rec = await this.db.sync.get(id)
    let etag: string
    try {
      etag = await this.remote.writeNote(note, { etag: rec?.etag ?? null, previous: rec?.base })
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err
      const current = await this.remote.storage.read(paths.note(id))
      if (current) {
        guardNewer(current.text)
        etag = await this.remote.writeNote(note, { etag: current.etag, previous: current.text })
        this.onEvent({ type: 'conflict', name: note.title || note.id })
      } else {
        etag = await this.remote.writeNote(note, { etag: null })
      }
    }

    let readablePath = rec?.readablePath
    if (note.kind === 'page') {
      try {
        const { meta } = await this.localMeta()
        const tree = buildTree(await this.db.notes.toArray())
        const crumbs = ancestors(tree, id).map((n) => n.title)
        readablePath = await this.remote.writeNoteReadable(note, crumbs, meta.locale, rec?.readablePath)
      } catch (err) {
        console.warn('[sync] readable copy failed', err)
      }
    }
    await this.db.sync.put({ id, etag, base: serialize(note), readablePath, kind: 'note' })
  }

  private async pushNoteDelete(id: string, snapshot?: Note) {
    const rec = await this.db.sync.get(id)
    if (!rec) return
    const note = snapshot ?? parseNote(rec.base)
    await this.remote.trashNote(note)
    if (rec.readablePath) await this.remote.removeReadable(rec.readablePath).catch(() => {})
    await this.db.sync.delete(id)
  }

  // --- pull ------------------------------------------------------------------

  private async pull() {
    const pending = new Set((await this.db.outbox.toArray()).map((e) => e.key))

    if (!pending.has('meta')) {
      const rec = await this.localMeta()
      const loaded = await this.remote.loadMeta()
      if (loaded && loaded.etag !== rec.etag) {
        await this.db.meta.put({ key: 'meta', ...loaded })
        // Another device may still write old defaults. Push the renamed file in this same run.
        if (await this.migrateMeta()) this.again = true
      }
    }

    const files = await this.remote.listItems()
    const syncs = (await this.db.sync.toArray()).filter((s) => s.kind !== 'note')
    const known = new Map(syncs.map((s) => [s.id, s]))

    const changed = files.filter((f) => known.get(f.id)?.etag !== f.etag && !pending.has(`item:${f.id}`))
    await pool(changed, 6, async (f) => {
      let remote: Awaited<ReturnType<VaultRemote['readItem']>>
      try {
        remote = await this.remote.readItem(f.id)
      } catch (err) {
        if (err instanceof UnsupportedVersionError) throw err
        if (err instanceof FormatError) {
          // A hand-edited or damaged file. Leave it alone and tell the user.
          this.onEvent({ type: 'corrupt', path: f.path })
          return
        }
        throw err
      }
      if (!remote) return
      const { item, etag, text } = remote
      await this.db.transaction('rw', this.db.items, this.db.sync, this.db.outbox, async () => {
        if (await this.db.outbox.where('key').equals(`item:${item.id}`).count()) return
        await this.db.items.put(item)
        await this.db.sync.put({ id: item.id, etag, base: text, readablePath: paths.readable(item) })
      })
    })

    // Deleted on another device. A suddenly empty listing with many known
    // items looks like a provider glitch, so don't trust it.
    const remoteIds = new Set(files.map((f) => f.id))
    const gone = syncs.filter((s) => !remoteIds.has(s.id) && !pending.has(`item:${s.id}`))
    if (gone.length > 0 && !(files.length === 0 && syncs.length > 3)) {
      await this.db.transaction('rw', this.db.items, this.db.sync, this.db.outbox, async () => {
        for (const s of gone) {
          if (await this.db.outbox.where('key').equals(`item:${s.id}`).count()) continue
          await this.db.items.delete(s.id)
          await this.db.sync.delete(s.id)
        }
      })
    }

    await this.pullNotes(pending)
  }

  /** Same rules as items: never clobber a pending local edit, distrust an empty listing. */
  private async pullNotes(pending: Set<string>) {
    const files = await this.remote.listNotes()
    const syncs = (await this.db.sync.toArray()).filter((s) => s.kind === 'note')
    const known = new Map(syncs.map((s) => [s.id, s]))
    const { meta } = await this.localMeta()

    const changed = files.filter((f) => known.get(f.id)?.etag !== f.etag && !pending.has(`note:${f.id}`))
    await pool(changed, 6, async (f) => {
      let remote: Awaited<ReturnType<VaultRemote['readNote']>>
      try {
        remote = await this.remote.readNote(f.id)
      } catch (err) {
        if (err instanceof UnsupportedVersionError) throw err
        if (err instanceof FormatError) {
          this.onEvent({ type: 'corrupt', path: f.path })
          return
        }
        throw err
      }
      if (!remote) return
      const { note, etag, text } = remote
      await this.db.transaction('rw', this.db.notes, this.db.sync, this.db.outbox, async () => {
        if (await this.db.outbox.where('key').equals(`note:${note.id}`).count()) return
        await this.db.notes.put(note)
        const readablePath = note.kind === 'page' ? paths.readableNote(note, meta.locale) : undefined
        await this.db.sync.put({ id: note.id, etag, base: text, readablePath, kind: 'note' })
      })
    })

    const remoteIds = new Set(files.map((f) => f.id))
    const gone = syncs.filter((s) => !remoteIds.has(s.id) && !pending.has(`note:${s.id}`))
    if (gone.length > 0 && !(files.length === 0 && syncs.length > 3)) {
      await this.db.transaction('rw', this.db.notes, this.db.sync, this.db.outbox, async () => {
        for (const s of gone) {
          if (await this.db.outbox.where('key').equals(`note:${s.id}`).count()) continue
          await this.db.notes.delete(s.id)
          await this.db.sync.delete(s.id)
        }
      })
    }
  }

  private async writeDerived() {
    try {
      const [items, { meta }] = await Promise.all([this.db.items.toArray(), this.localMeta()])
      await this.remote.writeDerived(items, meta)
      this.derivedDirty = false
    } catch (err) {
      if (err instanceof AuthError) throw err
      console.warn('[sync] index/CSV failed; will retry', err)
    }
  }
}

function guardNewer(text: string) {
  try {
    const v = (JSON.parse(text) as { formatVersion?: unknown }).formatVersion
    if (typeof v === 'number' && v > FORMAT_VERSION) throw new UnsupportedVersionError(v)
  } catch (err) {
    if (err instanceof UnsupportedVersionError) throw err
  }
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!)
  })
  await Promise.all(workers)
}

/** First-run vault meta, before the drive has been reached. */
export async function ensureLocalMeta(db: VaultDB, locale: string) {
  await db.transaction('rw', db.meta, async () => {
    if (!(await db.meta.get('meta'))) await db.meta.put({ key: 'meta', meta: createVaultMeta(locale), etag: null })
  })
}
