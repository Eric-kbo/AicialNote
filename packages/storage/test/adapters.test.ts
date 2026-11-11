import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleDriveAdapter } from '../src/google-drive'
import { MemoryAdapter } from '../src/memory'
import { OneDriveAdapter } from '../src/onedrive'
import { AuthError, ConflictError, ScopeError, type StorageAdapter } from '../src/types'

/** Behaviour every adapter must share. Run against the in-memory reference. */
async function conformance(storage: StorageAdapter) {
  expect(await storage.read('items/missing.json')).toBeNull()
  expect(await storage.list('items')).toEqual([])

  const a = await storage.write('items/a.json', '{"v":1}', { ifMatch: null })
  await expect(storage.write('items/a.json', 'x', { ifMatch: null })).rejects.toBeInstanceOf(ConflictError)
  const b = await storage.write('items/a.json', '{"v":2}', { ifMatch: a.etag })
  await expect(storage.write('items/a.json', 'x', { ifMatch: a.etag })).rejects.toBeInstanceOf(ConflictError)
  expect(await storage.read('items/a.json')).toEqual({ text: '{"v":2}', etag: b.etag })
  expect((await storage.list('items')).map((f) => f.path)).toEqual(['items/a.json'])

  await storage.remove('items/a.json')
  await storage.remove('items/a.json')
  expect(await storage.read('items/a.json')).toBeNull()
}

describe('MemoryAdapter', () => {
  it('follows the adapter contract', async () => {
    await conformance(new MemoryAdapter())
  })
})

// --- fetch mock --------------------------------------------------------------

interface Call {
  method: string
  url: string
  headers: Headers
  body?: string
}

function mockFetch(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const call = {
      method: init.method ?? 'GET',
      url: String(url),
      headers: new Headers(init.headers),
      body: init.body as string | undefined,
    }
    calls.push(call)
    return handler(call)
  })
  return calls
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('OneDriveAdapter', () => {
  const token = vi.fn(async () => 'tok')

  it('writes to the app folder with If-Match and maps 412 to ConflictError', async () => {
    const calls = mockFetch((c) =>
      c.headers.get('If-Match') === 'stale'
        ? new Response('', { status: 412 })
        : json({ name: 'a b.json', eTag: 'e2' }),
    )
    const od = new OneDriveAdapter(token)
    const meta = await od.write('items/a b.json', '{}', { ifMatch: 'e1' })
    expect(meta).toMatchObject({ path: 'items/a b.json', etag: 'e2' })
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/items/a%20b.json:/content',
    })
    expect(calls[0]!.headers.get('Authorization')).toBe('Bearer tok')
    expect(calls[0]!.headers.get('If-Match')).toBe('e1')

    await expect(od.write('items/a.json', '{}', { ifMatch: 'stale' })).rejects.toBeInstanceOf(ConflictError)
  })

  it('uses conflictBehavior=fail for create-only writes', async () => {
    const calls = mockFetch(() => new Response('', { status: 409 }))
    await expect(new OneDriveAdapter(token).write('vault.json', '{}', { ifMatch: null })).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(calls[0]!.url).toContain('?@microsoft.graph.conflictBehavior=fail')
  })

  it('reads through the pre-authenticated download URL', async () => {
    const calls = mockFetch((c) =>
      c.url.startsWith('https://dl.example')
        ? new Response('hello')
        : json({ name: 'a.json', eTag: 'e9', '@microsoft.graph.downloadUrl': 'https://dl.example/a' }),
    )
    expect(await new OneDriveAdapter(token).read('items/a.json')).toEqual({ text: 'hello', etag: 'e9' })
    expect(calls[1]!.headers.get('Authorization')).toBeNull()
  })

  it('lists files only, following pagination; missing folder is empty', async () => {
    mockFetch((c) => {
      if (c.url.includes('missing')) return new Response('', { status: 404 })
      if (c.url.includes('page2')) return json({ value: [{ name: 'b.json', eTag: 'b', file: {} }] })
      return json({
        value: [
          { name: 'a.json', eTag: 'a', file: {} },
          { name: 'sub', eTag: 's', folder: {} },
        ],
        '@odata.nextLink': 'https://graph.microsoft.com/page2',
      })
    })
    const od = new OneDriveAdapter(token)
    expect((await od.list('items')).map((f) => f.path)).toEqual(['items/a.json', 'items/b.json'])
    expect(await od.list('missing')).toEqual([])
  })

  it('refreshes the token once on 401, then gives up with AuthError', async () => {
    const tokens = vi.fn(async (force?: boolean) => (force ? 'fresh' : 'old'))
    mockFetch((c) =>
      c.headers.get('Authorization') === 'Bearer fresh'
        ? json({ name: 'a', eTag: 'e' })
        : new Response('', { status: 401 }),
    )
    await new OneDriveAdapter(tokens).write('a', 'x')
    expect(tokens).toHaveBeenLastCalledWith(true)

    mockFetch(() => new Response('', { status: 401 }))
    await expect(new OneDriveAdapter(tokens).write('a', 'x')).rejects.toBeInstanceOf(AuthError)
  })
})

describe('GoogleDriveAdapter', () => {
  const token = async () => 'tok'

  /** A tiny fake of the Drive v3 API: folders and files with versions. */
  function fakeDrive() {
    let n = 0
    const files = new Map<
      string,
      { id: string; name: string; parent: string; folder: boolean; text: string; version: number; trashed: boolean }
    >()
    const calls = mockFetch(async (c) => {
      const url = new URL(c.url)
      const q = url.searchParams.get('q')
      if (c.method === 'GET' && url.pathname === '/drive/v3/files' && q) {
        const parent = q.match(/'([^']+)' in parents/)![1]
        const name = q.match(/name = '([^']+)'/)?.[1]
        const wantFolder = q.includes("mimeType = 'application/vnd.google-apps.folder'")
        const found = [...files.values()].filter(
          (f) => !f.trashed && f.parent === parent && (!name || f.name === name) && f.folder === wantFolder,
        )
        return json({ files: found.map((f) => ({ id: f.id, name: f.name, version: String(f.version) })) })
      }
      if (c.method === 'POST' && url.pathname === '/drive/v3/files') {
        const body = JSON.parse(c.body!)
        const id = `f${++n}`
        files.set(id, {
          id,
          name: body.name,
          parent: body.parents[0],
          folder: true,
          text: '',
          version: 1,
          trashed: false,
        })
        return json({ id })
      }
      if (c.method === 'POST' && url.pathname === '/upload/drive/v3/files') {
        const meta = JSON.parse(c.body!.split('\r\n\r\n')[1]!.split('\r\n')[0]!)
        const text = c.body!.split('\r\n\r\n')[2]!.split('\r\n--')[0]!
        const id = `f${++n}`
        files.set(id, { id, name: meta.name, parent: meta.parents[0], folder: false, text, version: 1, trashed: false })
        return json({ id, name: meta.name, version: '1' })
      }
      const id = url.pathname.split('/').pop()!
      const f = files.get(id)
      if (!f) return new Response('', { status: 404 })
      if (c.method === 'PATCH' && url.pathname.startsWith('/upload/')) {
        f.text = c.body!
        f.version++
        return json({ id, name: f.name, version: String(f.version) })
      }
      if (c.method === 'PATCH') {
        Object.assign(f, JSON.parse(c.body!))
        return json({ id })
      }
      if (url.searchParams.get('alt') === 'media') return new Response(f.text)
      return json({ version: String(f.version), trashed: f.trashed })
    })
    return { files, calls }
  }

  it('follows the adapter contract', async () => {
    fakeDrive()
    await conformance(new GoogleDriveAdapter(token))
  })

  it('creates the vault folder once in My Drive and trashes instead of deleting', async () => {
    const { files, calls } = fakeDrive()
    const g = new GoogleDriveAdapter(token)
    await Promise.all([g.write('items/a.json', '1'), g.write('items/b.json', '2'), g.write('items/c.json', '3')])
    const folders = [...files.values()].filter((f) => f.folder)
    expect(folders.map((f) => [f.name, f.parent])).toEqual([
      ['AicialNote', 'root'],
      ['items', folders[0]!.id],
    ])

    await g.remove('items/a.json')
    expect([...files.values()].find((f) => f.name === 'a.json')!.trashed).toBe(true)
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('treats a token without Drive access as signed out, but not other 403s', async () => {
    // What Drive returns when the user unticked file access on the consent screen.
    const scopeError = {
      error: {
        code: 403,
        message: 'Request had insufficient authentication scopes.',
        errors: [{ message: 'Insufficient Permission', domain: 'global', reason: 'insufficientPermissions' }],
        status: 'PERMISSION_DENIED',
      },
    }
    mockFetch(() => json(scopeError, 403))
    await expect(new GoogleDriveAdapter(token).list('items')).rejects.toBeInstanceOf(ScopeError)

    const rateLimit = { error: { code: 403, errors: [{ reason: 'userRateLimitExceeded' }] } }
    mockFetch(() => json(rateLimit, 403))
    const err = await new GoogleDriveAdapter(token).list('items').catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(AuthError)
  })
})
