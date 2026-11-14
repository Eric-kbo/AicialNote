import { ConflictError, type FileMeta, type StorageAdapter } from '@aicialnote/storage'
import { fileStrings, pickPath } from './i18n'
import { type Note, noteToMarkdown, parseNote, readableNoteFileName } from './notes'
import { buildIndex, itemsToCsv, itemToMarkdown, readableFileName, readme } from './readable'
import { type Item, parseItem, parseVaultMeta, serialize, type VaultMeta } from './schema'

export const paths = {
  vault: 'vault.json',
  index: 'index.json',
  readme: 'README.md',
  itemsDir: 'items',
  item: (id: string) => `items/${id}.json`,
  history: (id: string, at: Date) => `history/${id}/${stamp(at)}.json`,
  trash: (id: string) => `trash/${id}.json`,
  readableDir: 'readable',
  readable: (item: Item) => `readable/${readableFileName(item)}`,
  csv: (locale: string) => `readable/${pickPath(fileStrings.allItemsCsv, locale)}`,
  notesDir: 'notes',
  note: (id: string) => `notes/${id}.json`,
  readableNote: (note: Note, locale: string) =>
    `readable/${pickPath(fileStrings.notesFolder, locale)}/${readableNoteFileName(note)}`,
}

/**
 * 20261108T073632.123Z. Milliseconds are kept: pages are saved while typing,
 * and two versions within one second must not share a history file.
 */
function stamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, '')
}

export function idFromItemPath(path: string): string | null {
  const m = path.match(/^items\/([^/]+)\.json$/)
  return m ? m[1]! : null
}

export function idFromNotePath(path: string): string | null {
  const m = path.match(/^notes\/([^/]+)\.json$/)
  return m ? m[1]! : null
}

export interface RemoteNote {
  note: Note
  etag: string
  text: string
}

export interface RemoteItem {
  item: Item
  etag: string
  text: string
}

/**
 * The vault as it lives on a storage backend. Stateless: callers keep track
 * of etags. Every destructive operation leaves a recoverable copy behind.
 */
export class VaultRemote {
  constructor(readonly storage: StorageAdapter) {}

  async loadMeta(): Promise<{ meta: VaultMeta; etag: string } | null> {
    const file = await this.storage.read(paths.vault)
    return file ? { meta: parseVaultMeta(file.text), etag: file.etag } : null
  }

  /**
   * Creates vault.json if the folder is new. If another device got there
   * first, returns the existing one instead.
   */
  async initMeta(meta: VaultMeta): Promise<{ meta: VaultMeta; etag: string; created: boolean }> {
    try {
      const written = await this.storage.write(paths.vault, serialize(meta), { ifMatch: null })
      await this.storage.write(paths.readme, readme(meta.locale)).catch(() => {})
      return { meta, etag: written.etag, created: true }
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err
      const existing = await this.loadMeta()
      if (!existing) throw err
      return { ...existing, created: false }
    }
  }

  async saveMeta(meta: VaultMeta, etag: string | null): Promise<string> {
    const written = await this.storage.write(paths.vault, serialize(meta), { ifMatch: etag })
    return written.etag
  }

  async listItems(): Promise<Array<FileMeta & { id: string }>> {
    const files = await this.storage.list(paths.itemsDir)
    return files.flatMap((f) => {
      const id = idFromItemPath(f.path)
      return id ? [{ ...f, id }] : []
    })
  }

  async readItem(id: string): Promise<RemoteItem | null> {
    const file = await this.storage.read(paths.item(id))
    if (!file) return null
    return { item: parseItem(file.text), etag: file.etag, text: file.text }
  }

  /**
   * Writes an item. When `previous` (the content we're replacing) is given it
   * is saved to history/ first, so no version is ever lost.
   * Throws ConflictError if the remote changed since `etag`.
   */
  async writeItem(item: Item, opts: { etag: string | null; previous?: string }): Promise<string> {
    return this.writeVersioned(paths.item(item.id), item.id, serialize(item), opts)
  }

  /** Same rules as writeItem: the replaced content goes to history/ first. */
  async writeNote(note: Note, opts: { etag: string | null; previous?: string }): Promise<string> {
    return this.writeVersioned(paths.note(note.id), note.id, serialize(note), opts)
  }

  private async writeVersioned(
    path: string,
    id: string,
    text: string,
    opts: { etag: string | null; previous?: string },
  ): Promise<string> {
    if (opts.previous !== undefined && opts.previous !== text) {
      await this.storage.write(paths.history(id, new Date()), opts.previous)
    }
    const written = await this.storage.write(path, text, { ifMatch: opts.etag })
    return written.etag
  }

  async listNotes(): Promise<Array<FileMeta & { id: string }>> {
    const files = await this.storage.list(paths.notesDir)
    return files.flatMap((f) => {
      const id = idFromNotePath(f.path)
      return id ? [{ ...f, id }] : []
    })
  }

  async readNote(id: string): Promise<RemoteNote | null> {
    const file = await this.storage.read(paths.note(id))
    if (!file) return null
    return { note: parseNote(file.text), etag: file.etag, text: file.text }
  }

  async trashNote(note: Note): Promise<void> {
    await this.storage.write(paths.trash(note.id), serialize({ ...note, deletedAt: new Date().toISOString() }))
    await this.storage.remove(paths.note(note.id))
  }

  /** readable/笔记/<title>.md for pages. Notebooks and sections have no copy of their own. */
  async writeNoteReadable(note: Note, crumbs: string[], locale: string, previousPath?: string): Promise<string> {
    const path = paths.readableNote(note, locale)
    await this.storage.write(path, noteToMarkdown(note, crumbs, locale))
    if (previousPath && previousPath !== path) await this.storage.remove(previousPath)
    return path
  }

  /** Moves an item to trash/. The item file then goes to the provider's recycle bin. */
  async trashItem(item: Item): Promise<void> {
    await this.storage.write(paths.trash(item.id), serialize({ ...item, deletedAt: new Date().toISOString() }))
    await this.storage.remove(paths.item(item.id))
  }

  /** Writes readable/<ID name>.md, removing the old file if the name changed. */
  async writeReadable(item: Item, meta: VaultMeta, previousPath?: string): Promise<string> {
    const path = paths.readable(item)
    await this.storage.write(path, itemToMarkdown(item, meta))
    if (previousPath && previousPath !== path) await this.storage.remove(previousPath)
    return path
  }

  async removeReadable(path: string): Promise<void> {
    await this.storage.remove(path)
  }

  /** index.json and the CSV overview. */
  async writeDerived(items: Item[], meta: VaultMeta): Promise<void> {
    const sorted = [...items].sort((a, b) => a.displayId.localeCompare(b.displayId))
    await this.storage.write(paths.index, serialize(buildIndex(sorted)))
    await this.storage.write(paths.csv(meta.locale), itemsToCsv(sorted, meta))
  }
}
