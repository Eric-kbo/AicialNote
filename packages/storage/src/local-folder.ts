import {
  ConflictError,
  type FileMeta,
  normalizePath,
  type ReadResult,
  type StorageAdapter,
  StorageError,
  splitPath,
  type WriteOptions,
} from './types'

/**
 * Stores the vault in a folder on this computer through the File System Access
 * API (Chromium browsers). Point it at a folder inside OneDrive / Google Drive
 * for desktop / Dropbox and the desktop client takes care of syncing.
 */
export class LocalFolderAdapter implements StorageAdapter {
  readonly kind = 'local'

  constructor(readonly root: FileSystemDirectoryHandle) {}

  async list(dir: string): Promise<FileMeta[]> {
    const handle = await this.dir(dir, false)
    if (!handle) return []
    const out: FileMeta[] = []
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue
      const file = await entry.getFile()
      out.push(toMeta(joinDir(dir, entry.name), file))
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async read(path: string): Promise<ReadResult | null> {
    const handle = await this.file(path, false)
    if (!handle) return null
    const file = await handle.getFile()
    return { text: await file.text(), etag: etagOf(file) }
  }

  async write(path: string, text: string, options: WriteOptions = {}): Promise<FileMeta> {
    const p = normalizePath(path)
    if (options.ifMatch !== undefined) {
      const existing = await this.file(p, false)
      const etag = existing ? etagOf(await existing.getFile()) : null
      if (options.ifMatch === null ? etag !== null : etag !== options.ifMatch) {
        throw new ConflictError(p, etag ?? undefined)
      }
    }
    const handle = await this.file(p, true)
    if (!handle) throw new StorageError(`Cannot create ${p}`)
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    return toMeta(p, await handle.getFile())
  }

  async remove(path: string): Promise<void> {
    const { dir, name } = splitPath(path)
    const parent = await this.dir(dir, false)
    if (!parent) return
    try {
      await parent.removeEntry(name)
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
  }

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let handle = this.root
    for (const part of normalizePath(path).split('/').filter(Boolean)) {
      try {
        handle = await handle.getDirectoryHandle(part, { create })
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
    }
    return handle
  }

  private async file(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
    const { dir, name } = splitPath(path)
    const parent = await this.dir(dir, create)
    if (!parent) return null
    try {
      return await parent.getFileHandle(name, { create })
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }
}

function etagOf(file: File): string {
  return `${file.lastModified}-${file.size}`
}

function toMeta(path: string, file: File): FileMeta {
  return {
    path: normalizePath(path),
    name: file.name,
    etag: etagOf(file),
    modifiedAt: new Date(file.lastModified).toISOString(),
    size: file.size,
  }
}

function joinDir(dir: string, name: string) {
  return dir ? `${dir}/${name}` : name
}

function isNotFound(err: unknown) {
  return err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')
}
