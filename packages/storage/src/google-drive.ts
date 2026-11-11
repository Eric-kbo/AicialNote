import { authedFetch, failure, type TokenProvider } from './http'
import { contentType } from './onedrive'
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

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,version,modifiedTime,size'

interface GFile {
  id: string
  name: string
  version?: string
  modifiedTime?: string
  size?: string
}

/**
 * Google Drive with the non-sensitive `drive.file` scope: the app can only see
 * files it created itself. The vault lives in a normal, visible folder
 * ("My Drive/AicialNote") so users can always open their data in Drive.
 *
 * Drive is id-based, so paths are resolved folder by folder and cached.
 */
export class GoogleDriveAdapter implements StorageAdapter {
  readonly kind = 'google'
  private folders = new Map<string, Promise<string | null>>()
  private files = new Map<string, string>()

  constructor(
    private readonly getToken: TokenProvider,
    private readonly rootName = 'AicialNote',
  ) {}

  async list(dir: string): Promise<FileMeta[]> {
    const d = normalizePath(dir)
    const folderId = await this.folder(d, false)
    if (!folderId) return []
    const out: FileMeta[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false and mimeType != '${FOLDER}'`,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: '1000',
        spaces: 'drive',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const res = await this.call(`${API}/files?${params}`)
      if (!res.ok) throw await failure(res, `List ${d || '/'}`)
      const body = (await res.json()) as { files: GFile[]; nextPageToken?: string }
      for (const f of body.files) {
        const path = d ? `${d}/${f.name}` : f.name
        this.files.set(path, f.id)
        out.push(toMeta(path, f))
      }
      pageToken = body.nextPageToken
    } while (pageToken)
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async read(path: string): Promise<ReadResult | null> {
    const p = normalizePath(path)
    return this.withFile(p, async (id) => {
      const [meta, media] = await Promise.all([
        this.call(`${API}/files/${id}?fields=version`),
        this.call(`${API}/files/${id}?alt=media`),
      ])
      if (meta.status === 404 || media.status === 404) return 'missing'
      if (!meta.ok) throw await failure(meta, `Read ${p}`)
      if (!media.ok) throw await failure(media, `Read ${p}`)
      const { version } = (await meta.json()) as GFile
      return { text: await media.text(), etag: version ?? '' }
    })
  }

  async write(path: string, text: string, options: WriteOptions = {}): Promise<FileMeta> {
    const p = normalizePath(path)
    const existingId = await this.find(p)

    if (options.ifMatch !== undefined) {
      const current = existingId ? await this.version(existingId) : null
      const matches = options.ifMatch === null ? current === null : current === options.ifMatch
      if (!matches) throw new ConflictError(p, current ?? undefined)
    }

    if (existingId) {
      const res = await this.call(`${UPLOAD}/files/${existingId}?uploadType=media&fields=${FILE_FIELDS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': contentType(p) },
        body: text,
      })
      if (res.status !== 404) {
        if (!res.ok) throw await failure(res, `Write ${p}`)
        return toMeta(p, (await res.json()) as GFile)
      }
      this.files.delete(p)
    }

    const { dir, name } = splitPath(p)
    const parent = await this.folder(dir, true)
    const boundary = `aicialnote${Math.random().toString(36).slice(2)}`
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name, parents: [parent], mimeType: contentType(p).split(';')[0] })}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType(p)}\r\n\r\n${text}\r\n--${boundary}--`
    const res = await this.call(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    if (!res.ok) throw await failure(res, `Create ${p}`)
    const created = (await res.json()) as GFile
    this.files.set(p, created.id)
    return toMeta(p, created)
  }

  async remove(path: string): Promise<void> {
    const p = normalizePath(path)
    await this.withFile(p, async (id) => {
      // Move to Drive trash rather than deleting permanently.
      const res = await this.call(`${API}/files/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      })
      if (res.status === 404) return 'missing'
      if (!res.ok) throw await failure(res, `Delete ${p}`)
      this.files.delete(p)
      return null
    })
  }

  // ---------------------------------------------------------------------------

  private call(url: string, init?: RequestInit) {
    return authedFetch(this.getToken, url, init)
  }

  /** Runs `fn` with the file id; retries once if a cached id went stale. */
  private async withFile<T>(path: string, fn: (id: string) => Promise<T | 'missing'>): Promise<T | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = await this.find(path)
      if (!id) return null
      const result = await fn(id)
      if (result !== 'missing') return result
      this.files.delete(path)
    }
    return null
  }

  private async version(id: string): Promise<string | null> {
    const res = await this.call(`${API}/files/${id}?fields=version,trashed`)
    if (res.status === 404) return null
    if (!res.ok) throw await failure(res, 'Read version')
    const f = (await res.json()) as GFile & { trashed?: boolean }
    return f.trashed ? null : (f.version ?? null)
  }

  private async find(path: string): Promise<string | null> {
    const cached = this.files.get(path)
    if (cached) return cached
    const { dir, name } = splitPath(path)
    const parent = await this.folder(dir, false)
    if (!parent) return null
    const id = await this.lookup(name, parent, false)
    if (id) this.files.set(path, id)
    return id
  }

  private folder(path: string, create: true): Promise<string>
  private folder(path: string, create: boolean): Promise<string | null>
  private async folder(path: string, create: boolean): Promise<string | null> {
    const key = normalizePath(path)
    const cached = this.folders.get(key)
    if (cached) {
      const id = await cached
      if (id || !create) return id
    }
    // Cache the in-flight promise so concurrent writes don't create duplicates.
    const pending = this.resolveFolder(key, create)
    this.folders.set(key, pending)
    try {
      const id = await pending
      if (!id && this.folders.get(key) === pending) this.folders.delete(key)
      return id
    } catch (err) {
      if (this.folders.get(key) === pending) this.folders.delete(key)
      throw err
    }
  }

  private async resolveFolder(key: string, create: boolean): Promise<string | null> {
    const { dir, name } = key ? splitPath(key) : { dir: '', name: '' }
    const parent = key ? await this.folder(dir, create) : 'root'
    if (!parent) return null
    const folderName = key ? name : this.rootName
    const found = await this.lookup(folderName, parent, true)
    if (found || !create) return found
    const res = await this.call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: FOLDER, parents: [parent] }),
    })
    if (!res.ok) throw await failure(res, `Create folder ${key || this.rootName}`)
    return ((await res.json()) as GFile).id
  }

  private async lookup(name: string, parent: string, isFolder: boolean): Promise<string | null> {
    const q = [
      `name = '${escapeQ(name)}'`,
      `'${parent}' in parents`,
      'trashed = false',
      isFolder ? `mimeType = '${FOLDER}'` : `mimeType != '${FOLDER}'`,
    ].join(' and ')
    const params = new URLSearchParams({
      q,
      fields: 'files(id,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: '10',
    })
    const res = await this.call(`${API}/files?${params}`)
    if (!res.ok) throw await failure(res, `Lookup ${name}`)
    const body = (await res.json()) as { files: GFile[] }
    return body.files[0]?.id ?? null
  }
}

function escapeQ(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function toMeta(path: string, f: GFile): FileMeta {
  if (!f.version) throw new StorageError(`Drive returned no version for ${path}`)
  return {
    path,
    name: splitPath(path).name,
    etag: f.version,
    modifiedAt: f.modifiedTime,
    size: f.size ? Number(f.size) : undefined,
  }
}
