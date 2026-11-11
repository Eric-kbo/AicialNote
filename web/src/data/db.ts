import type { Item, Note, VaultMeta } from '@aicialnote/core'
import Dexie, { type EntityTable } from 'dexie'

/** Where the vault lives. Persisted so the app reopens where it left off. */
export type Connection =
  | { kind: 'google' | 'microsoft'; accountId: string; email: string; name: string }
  | { kind: 'local'; folderName: string }
  | { kind: 'demo' }

export function connectionKey(c: Connection): string {
  switch (c.kind) {
    case 'google':
    case 'microsoft':
      return `${c.kind}-${c.accountId}`
    case 'local':
      return `local-${c.folderName}`
    case 'demo':
      return 'demo'
  }
}

// --- app-wide database -------------------------------------------------------

interface KV {
  key: string
  value: unknown
}

class AppDB extends Dexie {
  kv!: EntityTable<KV, 'key'>
  constructor() {
    super('aicialnote')
    this.version(1).stores({ kv: 'key' })
  }
}

export const appDb = new AppDB()

export async function getConnection(): Promise<Connection | undefined> {
  return (await appDb.kv.get('connection'))?.value as Connection | undefined
}

export async function setConnection(c: Connection | null) {
  if (c) await appDb.kv.put({ key: 'connection', value: c })
  else await appDb.kv.delete('connection')
}

export async function getFolderHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return (await appDb.kv.get('folderHandle'))?.value as FileSystemDirectoryHandle | undefined
}

export async function setFolderHandle(h: FileSystemDirectoryHandle) {
  await appDb.kv.put({ key: 'folderHandle', value: h })
}

// --- per-vault cache -----------------------------------------------------------

/** What we last saw on the remote for an item. */
export interface SyncRecord {
  id: string
  etag: string
  /** Serialized remote content at `etag`. Saved to history before overwrite. */
  base: string
  readablePath?: string
  /** Absent for items (the original kind). */
  kind?: 'note'
}

export interface OutboxEntry {
  seq?: number
  /** "meta", "item:<id>" or "note:<id>" */
  key: string
  op: 'put' | 'delete'
  /** Snapshot for deletes, so trash/ gets the last content. */
  snapshot?: Item | Note
}

export interface MetaRecord {
  key: 'meta'
  meta: VaultMeta
  etag: string | null
}

/**
 * Local-first cache of one vault. The UI reads and writes here instantly;
 * the sync engine mirrors it to the drive in the background.
 */
export class VaultDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  sync!: EntityTable<SyncRecord, 'id'>
  outbox!: EntityTable<OutboxEntry, 'seq'>
  notes!: EntityTable<Note, 'id'>
  meta!: EntityTable<MetaRecord, 'key'>

  constructor(name: string) {
    super(`aicialnote-vault-${name}`)
    this.version(1).stores({
      items: 'id, displayId, updatedAt',
      sync: 'id',
      outbox: '++seq, key',
      meta: 'key',
    })
    this.version(2).stores({ notes: 'id, parentId' })
  }
}
