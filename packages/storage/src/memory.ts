import {
  ConflictError,
  type FileMeta,
  normalizePath,
  type ReadResult,
  type StorageAdapter,
  splitPath,
  type WriteOptions,
} from './types'

interface Entry {
  text: string
  etag: string
  modifiedAt: string
}

/** In-memory adapter for tests and the demo mode. */
export class MemoryAdapter implements StorageAdapter {
  readonly kind = 'memory'
  private files = new Map<string, Entry>()
  private counter = 0

  /** Every removed file, newest last. Mirrors a cloud recycle bin. */
  readonly recycleBin: Array<{ path: string; text: string }> = []

  async list(dir: string): Promise<FileMeta[]> {
    const d = normalizePath(dir)
    const out: FileMeta[] = []
    for (const [path, e] of this.files) {
      const parts = splitPath(path)
      if (parts.dir === d) out.push(this.meta(path, e))
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async read(path: string): Promise<ReadResult | null> {
    const e = this.files.get(normalizePath(path))
    return e ? { text: e.text, etag: e.etag } : null
  }

  async write(path: string, text: string, options: WriteOptions = {}): Promise<FileMeta> {
    const p = normalizePath(path)
    const current = this.files.get(p)
    if (options.ifMatch === null && current) throw new ConflictError(p, current.etag)
    if (typeof options.ifMatch === 'string' && current?.etag !== options.ifMatch) {
      throw new ConflictError(p, current?.etag)
    }
    const e: Entry = { text, etag: `m${++this.counter}`, modifiedAt: new Date().toISOString() }
    this.files.set(p, e)
    return this.meta(p, e)
  }

  async remove(path: string): Promise<void> {
    const p = normalizePath(path)
    const e = this.files.get(p)
    if (!e) return
    this.recycleBin.push({ path: p, text: e.text })
    this.files.delete(p)
  }

  /** Test helper: every file path currently stored. */
  paths(): string[] {
    return [...this.files.keys()].sort()
  }

  private meta(path: string, e: Entry): FileMeta {
    return { path, name: splitPath(path).name, etag: e.etag, modifiedAt: e.modifiedAt, size: e.text.length }
  }
}
