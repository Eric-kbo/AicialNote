import {
  buildTree,
  createItem,
  createNote,
  type ImportPlan,
  type Item,
  type Locale,
  type Note,
  type NoteTree,
  subtree,
  type VaultMeta,
  VaultRemote,
} from '@aicialnote/core'
import type { StorageAdapter } from '@aicialnote/storage'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { type Connection, connectionKey, VaultDB } from './db'
import { ensureLocalMeta, SyncEngine, type SyncEvent, type SyncStatus } from './sync'

export interface Vault {
  connection: Connection
  db: VaultDB
  engine: SyncEngine
  actions: VaultActions
}

const VaultContext = createContext<Vault | null>(null)

export function VaultProvider(props: {
  connection: Connection
  storage: StorageAdapter
  locale: Locale
  onEvent: (e: SyncEvent) => void
  children: ReactNode
}) {
  const { connection, storage, locale, onEvent } = props
  const [vault, setVault] = useState<Vault | null>(null)
  const key = connectionKey(connection)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    const db = new VaultDB(key)
    const engine = new SyncEngine(db, new VaultRemote(storage), (e) => onEventRef.current(e))
    let cancelled = false
    void (async () => {
      try {
        if (connection.kind === 'demo') await Promise.all(db.tables.map((t) => t.clear()))
        await ensureLocalMeta(db, locale)
      } catch (err) {
        // StrictMode / fast account switches close the db mid-way; that's fine.
        if (cancelled) return
        throw err
      }
      if (cancelled) return
      setVault({ connection, db, engine, actions: createActions(db, engine) })
      engine.start()
    })()
    return () => {
      cancelled = true
      engine.stop()
      db.close()
    }
    // A vault is identified by its connection key; the rest is stable for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storage])

  if (!vault) return null
  return <VaultContext.Provider value={vault}>{props.children}</VaultContext.Provider>
}

export function useVault(): Vault {
  const v = useContext(VaultContext)
  if (!v) throw new Error('useVault outside VaultProvider')
  return v
}

// --- queries -------------------------------------------------------------------

export function useItems(): Item[] | undefined {
  const { db } = useVault()
  return useLiveQuery(() => db.items.toArray(), [db])
}

export function useItem(id: string): Item | null | undefined {
  const { db } = useVault()
  return useLiveQuery(async () => (await db.items.get(id)) ?? null, [db, id])
}

export function useMeta(): VaultMeta | undefined {
  const { db } = useVault()
  return useLiveQuery(async () => (await db.meta.get('meta'))?.meta, [db])
}

export function usePendingCount(): number {
  const { db } = useVault()
  return useLiveQuery(() => db.outbox.count(), [db]) ?? 0
}

export function useSyncStatus(): SyncStatus {
  const { engine } = useVault()
  return useSyncExternalStore(engine.subscribe, engine.getStatus)
}

export function useNotes(): Note[] | undefined {
  const { db } = useVault()
  return useLiveQuery(() => db.notes.toArray(), [db])
}

const NoteTreeContext = createContext<NoteTree | undefined>(undefined)

/** One live query for the whole notebook tree, shared by every row and pane. */
export function NoteTreeProvider({ children }: { children: ReactNode }) {
  const notes = useNotes()
  const items = useItems()
  const tree = useMemo(() => notes && items && buildTree(notes, items), [notes, items])
  return <NoteTreeContext.Provider value={tree}>{children}</NoteTreeContext.Provider>
}

/** The whole notebook tree, or undefined while it loads. Small enough to keep in memory. */
export function useNoteTree(): NoteTree | undefined {
  return useContext(NoteTreeContext)
}

/** Items sorted by display id, newest first. */
export function useSortedItems() {
  const items = useItems()
  return useMemo(() => items && [...items].sort((a, b) => b.displayId.localeCompare(a.displayId)), [items])
}

// --- mutations -----------------------------------------------------------------

export type VaultActions = ReturnType<typeof createActions>

/** What deleting a note did, so Undo can put everything back. */
export interface NoteDeletion {
  notes: Note[]
  unfiled: Array<{ id: string; location: NonNullable<Item['location']> }>
}

function createActions(db: VaultDB, engine: SyncEngine) {
  const touch = (item: Item) => {
    item.updatedAt = new Date().toISOString()
  }

  return {
    /** Creates items with consecutive display ids. */
    async createItems(builders: Array<(item: Item) => void>): Promise<Item[]> {
      const created = await db.transaction('rw', db.items, db.meta, db.outbox, async () => {
        const rec = await db.meta.get('meta')
        if (!rec) throw new Error('vault meta missing')
        const out: Item[] = []
        let seq = rec.meta.nextSeq
        for (const build of builders) {
          const item = createItem({ seq: seq++ })
          build(item)
          await db.items.add(item)
          await db.outbox.add({ key: `item:${item.id}`, op: 'put' })
          out.push(item)
        }
        await db.meta.put({ ...rec, meta: { ...rec.meta, nextSeq: seq } })
        await db.outbox.add({ key: 'meta', op: 'put' })
        return out
      })
      engine.schedule()
      return created
    },

    async updateItem(id: string, recipe: (draft: Item) => void): Promise<void> {
      const changed = await db.transaction('rw', db.items, db.outbox, async () => {
        const item = await db.items.get(id)
        if (!item) return false
        const draft = structuredClone(item)
        recipe(draft)
        if (JSON.stringify(draft) === JSON.stringify(item)) return false
        touch(draft)
        await db.items.put(draft)
        await db.outbox.add({ key: `item:${id}`, op: 'put' })
        return true
      })
      if (changed) engine.schedule()
    },

    async deleteItem(id: string): Promise<Item | undefined> {
      const item = await db.transaction('rw', db.items, db.outbox, async () => {
        const item = await db.items.get(id)
        if (!item) return undefined
        await db.items.delete(id)
        await db.outbox.add({ key: `item:${id}`, op: 'delete', snapshot: item })
        return item
      })
      // Give "Undo" a moment before the delete reaches the drive.
      engine.schedule(6000)
      return item
    },

    async restoreItem(item: Item): Promise<void> {
      await db.transaction('rw', db.items, db.outbox, async () => {
        await db.items.put(item)
        await db.outbox.add({ key: `item:${item.id}`, op: 'put' })
      })
      engine.schedule()
    },

    // --- notes ---------------------------------------------------------------

    async createNote(input: Parameters<typeof createNote>[0]): Promise<Note> {
      const note = createNote(input)
      await db.transaction('rw', db.notes, db.outbox, async () => {
        await db.notes.add(note)
        await db.outbox.add({ key: `note:${note.id}`, op: 'put' })
      })
      engine.schedule()
      return note
    },

    /**
     * `typing` pushes later: a page is saved locally on every pause, but each
     * push leaves a history/ copy, so a burst of typing becomes one version.
     */
    async updateNote(id: string, recipe: (draft: Note) => void, opts: { typing?: boolean } = {}): Promise<void> {
      const changed = await db.transaction('rw', db.notes, db.outbox, async () => {
        const note = await db.notes.get(id)
        if (!note) return false
        const draft = structuredClone(note)
        recipe(draft)
        if (JSON.stringify(draft) === JSON.stringify(note)) return false
        draft.updatedAt = new Date().toISOString()
        await db.notes.put(draft)
        await db.outbox.add({ key: `note:${id}`, op: 'put' })
        return true
      })
      if (changed) engine.schedule(opts.typing ? 4000 : 700)
    },

    /** Deletes a node and everything below it. Returns the snapshots for Undo. */
    /**
     * Deletes a note and everything below it. Accounts inside are never
     * deleted with it: they lose their location and show up as "unfiled".
     */
    async deleteNote(id: string): Promise<NoteDeletion> {
      const result = await db.transaction('rw', db.notes, db.items, db.outbox, async () => {
        const tree = buildTree(await db.notes.toArray(), await db.items.toArray())
        const out: NoteDeletion = { notes: [], unfiled: [] }
        for (const n of subtree(tree, id)) {
          if (n.kind === 'account') {
            const item = await db.items.get(n.id)
            if (!item?.location) continue
            out.unfiled.push({ id: item.id, location: item.location })
            const draft = structuredClone(item)
            delete draft.location
            touch(draft)
            await db.items.put(draft)
            await db.outbox.add({ key: `item:${item.id}`, op: 'put' })
          } else {
            await db.notes.delete(n.id)
            await db.outbox.add({ key: `note:${n.id}`, op: 'delete', snapshot: n })
            out.notes.push(n)
          }
        }
        return out
      })
      engine.schedule(6000)
      return result
    },

    async restoreNotes(deletion: NoteDeletion): Promise<void> {
      await db.transaction('rw', db.notes, db.items, db.outbox, async () => {
        for (const n of deletion.notes) {
          await db.notes.put(n)
          await db.outbox.add({ key: `note:${n.id}`, op: 'put' })
        }
        for (const { id, location } of deletion.unfiled) {
          const item = await db.items.get(id)
          // Filed somewhere else in the meantime: leave it there.
          if (!item || item.location) continue
          await db.items.put({ ...item, location, updatedAt: new Date().toISOString() })
          await db.outbox.add({ key: `item:${id}`, op: 'put' })
        }
      })
      engine.schedule()
    },

    /** Puts an item into a notebook (or takes it out with `null`). */
    async placeItem(id: string, location: Item['location'] | null): Promise<void> {
      await this.updateItem(id, (d) => {
        if (location) d.location = location
        else delete d.location
      })
    },

    // --- export / import -------------------------------------------------------

    /** Everything needed for a backup file, read from the local cache. */
    async snapshot() {
      return db.transaction('r', db.items, db.notes, db.meta, async () => {
        const rec = await db.meta.get('meta')
        if (!rec) throw new Error('vault meta missing')
        return { meta: rec.meta, items: await db.items.toArray(), notes: await db.notes.toArray() }
      })
    },

    /**
     * Writes an import plan (see `planImport`). Replaced records reach history/
     * through the normal push, exactly like an edit, so nothing is lost.
     */
    async applyImport(plan: ImportPlan): Promise<void> {
      await db.transaction('rw', db.items, db.notes, db.meta, db.outbox, async () => {
        for (const note of [...plan.addNotes, ...plan.updateNotes]) {
          await db.notes.put(note)
          await db.outbox.add({ key: `note:${note.id}`, op: 'put' })
        }
        for (const item of [...plan.addItems, ...plan.updateItems]) {
          await db.items.put(item)
          await db.outbox.add({ key: `item:${item.id}`, op: 'put' })
        }
        const rec = await db.meta.get('meta')
        if (!rec) throw new Error('vault meta missing')
        const nextSeq = Math.max(rec.meta.nextSeq, plan.nextSeq)
        if (nextSeq !== rec.meta.nextSeq || plan.addStatuses.length) {
          const known = new Set(rec.meta.statuses.map((s) => s.id))
          const statuses = [...rec.meta.statuses, ...plan.addStatuses.filter((s) => !known.has(s.id))]
          await db.meta.put({ ...rec, meta: { ...rec.meta, nextSeq, statuses } })
          await db.outbox.add({ key: 'meta', op: 'put' })
        }
      })
      engine.schedule()
    },

    syncNow() {
      engine.schedule(0)
    },
  }
}
