import { AuthError, ScopeError, StorageError } from './types'

/** Returns a valid access token. `force` bypasses any cached token. */
export type TokenProvider = (force?: boolean) => Promise<string>

const MAX_ATTEMPTS = 4

/**
 * fetch() with bearer auth, one silent token refresh on 401, and backoff on
 * throttling / transient server errors.
 */
export async function authedFetch(getToken: TokenProvider, url: string, init: RequestInit = {}): Promise<Response> {
  let forced = false
  for (let attempt = 1; ; attempt++) {
    const token = await getToken(forced)
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    let res: Response
    try {
      res = await fetch(url, { ...init, headers })
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new StorageError('Network error', 0, { cause: err })
      await sleep(backoff(attempt))
      continue
    }
    if (res.status === 401) {
      if (forced) throw new AuthError()
      forced = true
      continue
    }
    // The user signed in without granting file access (Google lets them untick
    // it on the consent screen). A new token won't help; they must consent again.
    if (res.status === 403 && (await lacksScope(res))) throw new ScopeError()
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('Retry-After'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt))
      continue
    }
    return res
  }
}

export async function failure(res: Response, what: string): Promise<StorageError> {
  let detail = ''
  try {
    detail = (await res.text()).slice(0, 300)
  } catch {
    // ignore
  }
  return new StorageError(`${what} failed (${res.status})${detail ? `: ${detail}` : ''}`, res.status)
}

// Google: reason "insufficientPermissions" / ACCESS_TOKEN_SCOPE_INSUFFICIENT.
const SCOPE_ERROR = /insufficient(Permissions|[ _]?(authentication )?scope)|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i

async function lacksScope(res: Response): Promise<boolean> {
  if (/insufficient_scope/i.test(res.headers.get('WWW-Authenticate') ?? '')) return true
  try {
    return SCOPE_ERROR.test(await res.clone().text())
  } catch {
    return false
  }
}

function backoff(attempt: number) {
  return Math.min(8000, 400 * 2 ** (attempt - 1)) + Math.random() * 250
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
