import { authedFetch, failure, type TokenProvider } from './http'
import {
  ConflictError,
  type FileMeta,
  normalizePath,
  type ReadResult,
  type StorageAdapter,
  splitPath,
  type WriteOptions,
} from './types'

const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/special/approot'

interface DriveItem {
  name: string
  eTag: string
  size?: number
  lastModifiedDateTime?: string
  file?: unknown
  folder?: unknown
  '@microsoft.graph.downloadUrl'?: string
}

/**
 * OneDrive through Microsoft Graph, scoped to the app folder
 * (`Files.ReadWrite.AppFolder`). Users see the data under "Apps/AicialNote".
 */
export class OneDriveAdapter implements StorageAdapter {
  readonly kind = 'onedrive'

  constructor(private readonly getToken: TokenProvider) {}

  async list(dir: string): Promise<FileMeta[]> {
    const d = normalizePath(dir)
    let url: string | undefined = `${d ? `${GRAPH}:/${encodePath(d)}:` : GRAPH}/children?$top=999`
    const out: FileMeta[] = []
    while (url) {
      const res = await authedFetch(this.getToken, url)
      if (res.status === 404) return []
      if (!res.ok) throw await failure(res, `List ${d || '/'}`)
      const body = (await res.json()) as { value: DriveItem[]; '@odata.nextLink'?: string }
      for (const item of body.value) {
        if (item.file) out.push(toMeta(d ? `${d}/${item.name}` : item.name, item))
      }
      url = body['@odata.nextLink']
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async read(path: string): Promise<ReadResult | null> {
    const p = normalizePath(path)
    const res = await authedFetch(this.getToken, `${GRAPH}:/${encodePath(p)}`)
    if (res.status === 404) return null
    if (!res.ok) throw await failure(res, `Read ${p}`)
    const item = (await res.json()) as DriveItem
    const downloadUrl = item['@microsoft.graph.downloadUrl']
    const content = downloadUrl
      ? await fetch(downloadUrl)
      : await authedFetch(this.getToken, `${GRAPH}:/${encodePath(p)}:/content`)
    if (!content.ok) throw await failure(content, `Download ${p}`)
    return { text: await content.text(), etag: item.eTag }
  }

  async write(path: string, text: string, options: WriteOptions = {}): Promise<FileMeta> {
    const p = normalizePath(path)
    const headers: Record<string, string> = { 'Content-Type': contentType(p) }
    let url = `${GRAPH}:/${encodePath(p)}:/content`
    if (options.ifMatch === null) url += '?@microsoft.graph.conflictBehavior=fail'
    else if (typeof options.ifMatch === 'string') headers['If-Match'] = options.ifMatch
    const res = await authedFetch(this.getToken, url, { method: 'PUT', headers, body: text })
    if (res.status === 409 || res.status === 412) throw new ConflictError(p)
    if (!res.ok) throw await failure(res, `Write ${p}`)
    return toMeta(p, (await res.json()) as DriveItem)
  }

  async remove(path: string): Promise<void> {
    const p = normalizePath(path)
    // DELETE moves the item to the OneDrive recycle bin.
    const res = await authedFetch(this.getToken, `${GRAPH}:/${encodePath(p)}`, { method: 'DELETE' })
    if (res.status === 404 || res.ok) return
    throw await failure(res, `Delete ${p}`)
  }
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function toMeta(path: string, item: DriveItem): FileMeta {
  return {
    path,
    name: splitPath(path).name,
    etag: item.eTag,
    modifiedAt: item.lastModifiedDateTime,
    size: item.size,
  }
}

export function contentType(path: string) {
  if (path.endsWith('.json')) return 'application/json; charset=utf-8'
  if (path.endsWith('.md')) return 'text/markdown; charset=utf-8'
  if (path.endsWith('.csv')) return 'text/csv; charset=utf-8'
  return 'text/plain; charset=utf-8'
}
