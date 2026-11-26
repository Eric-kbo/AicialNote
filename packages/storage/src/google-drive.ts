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
  createdTime?: string
  size?: string
}

/**
 * Google Drive with the non-sensitive `drive.file` scope: the app can only see
 * files it created itself. The vault lives in a normal, visible folder
 * ("My Drive/AicialNote") so users can always open their data in Drive.
 *
 * Drive is id-based, so paths are resolved folder by folder and cached.
 *
 * Drive also allows two folders or two files with one name in the same place, and two clients that create the
 * same path at the same moment leave such twins behind. They are read as one: a folder is all folders of that
 * name together, and a file is the twin that changed last. Otherwise each client would pick its own twin and
 * hand the other an old copy as if it were news.
 */
export class GoogleDriveAdapter implements StorageAdapter {
  readonly kind = 'google'
  private folders = new Map<string, Promise<string[]>>()
  private files = new Map<string, string>()

  constructor(
    private readonly getToken: TokenProvider,
    private readonly rootName = 'AicialNote',
  ) {}

  async list(dir: string): Promise<FileMeta[]> {
    const d = normalizePath(dir)
    const folderIds = await this.folderIds(d, false)
    if (folderIds.length === 0) return []
    const byPath = new Map<string, GFile>()
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `${inParents(folderIds)} and trashed = false and mimeType != '${FOLDER}'`,
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
        const other = byPath.get(path)
        if (!other || isNewer(f, other)) byPath.set(path, f)
      }
      pageToken = body.nextPageToken
    } while (pageToken)
    const out: FileMeta[] = []
    for (const [path, f] of byPath) {
      this.files.set(path, f.id)
      out.push(toMeta(path, f))
    }
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
    const parents = await this.folderIds(dir, false)
    if (parents.length === 0) return null
    const twins = await this.lookup(name, parents, false)
    const id = twins.reduce<GFile | null>((best, f) => (!best || isNewer(f, best) ? f : best), null)?.id ?? null
    if (id) this.files.set(path, id)
    return id
  }

  /** The folder new files go into: of twins, the one created first, which no later write can change. */
  private folder(path: string, create: true): Promise<string>
  private async folder(path: string, create: boolean): Promise<string | null> {
    return (await this.folderIds(path, create))[0] ?? null
  }

  /** Every folder at this path, oldest first. Empty when there is none and `create` is off. */
  private async folderIds(path: string, create: boolean): Promise<string[]> {
    const key = normalizePath(path)
    const cached = this.folders.get(key)
    if (cached) {
      const ids = await cached
      if (ids.length > 0 || !create) return ids
    }
    // Cache the in-flight promise so concurrent writes don't create duplicates.
    const pending = this.resolveFolders(key, create)
    this.folders.set(key, pending)
    try {
      const ids = await pending
      if (ids.length === 0 && this.folders.get(key) === pending) this.folders.delete(key)
      return ids
    } catch (err) {
      if (this.folders.get(key) === pending) this.folders.delete(key)
      throw err
    }
  }

  private async resolveFolders(key: string, create: boolean): Promise<string[]> {
    const { dir, name } = key ? splitPath(key) : { dir: '', name: '' }
    const parents = key ? await this.folderIds(dir, create) : ['root']
    if (parents.length === 0) return []
    const folderName = key ? name : this.rootName
    const found = await this.lookup(folderName, parents, true)
    if (found.length > 0 || !create) {
      const age = (f: GFile) => f.createdTime ?? ''
      return found.sort((a, b) => age(a).localeCompare(age(b)) || a.id.localeCompare(b.id)).map((f) => f.id)
    }
    const res = await this.call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: FOLDER, parents: [parents[0]] }),
    })
    if (!res.ok) throw await failure(res, `Create folder ${key || this.rootName}`)
    return [((await res.json()) as GFile).id]
  }

  private async lookup(name: string, parents: string[], isFolder: boolean): Promise<GFile[]> {
    const q = [
      `name = '${escapeQ(name)}'`,
      inParents(parents),
      'trashed = false',
      isFolder ? `mimeType = '${FOLDER}'` : `mimeType != '${FOLDER}'`,
    ].join(' and ')
    const params = new URLSearchParams({ q, fields: 'files(id,modifiedTime,createdTime)', pageSize: '100' })
    const res = await this.call(`${API}/files?${params}`)
    if (!res.ok) throw await failure(res, `Lookup ${name}`)
    return ((await res.json()) as { files: GFile[] }).files
  }
}

function inParents(ids: string[]) {
  return `(${ids.map((id) => `'${id}' in parents`).join(' or ')})`
}

/** Of two files with one name, the one changed last is the file; the id only makes the choice stable. */
function isNewer(a: GFile, b: GFile) {
  const at = a.modifiedTime ?? ''
  const bt = b.modifiedTime ?? ''
  return at === bt ? a.id > b.id : at > bt
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
