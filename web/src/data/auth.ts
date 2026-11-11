import { AuthError, StorageError, type TokenProvider } from '@aicialnote/storage'

export type CloudProvider = 'google' | 'microsoft'

export interface Account {
  provider: CloudProvider
  id: string
  email: string
  name: string
}

interface TokenResponse {
  accessToken: string
  expiresAt: number
  account: Account
}

const HEADERS = { 'X-AicialNote': '1' }

async function fetchToken(provider: CloudProvider): Promise<TokenResponse> {
  let res: Response
  try {
    res = await fetch(`/auth/${provider}/token`, { method: 'POST', headers: HEADERS, credentials: 'same-origin' })
  } catch (err) {
    throw new StorageError('Cannot reach the AicialNote server', 0, { cause: err })
  }
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new StorageError(`Token request failed (${res.status})`, res.status)
  return (await res.json()) as TokenResponse
}

/** Access token cache with de-duplicated refreshes. Tokens live in memory only. */
export function createTokenProvider(provider: CloudProvider): TokenProvider {
  let current: TokenResponse | null = null
  let inflight: Promise<TokenResponse> | null = null
  return async (force = false) => {
    if (!force && current && current.expiresAt - 90_000 > Date.now()) return current.accessToken
    inflight ??= fetchToken(provider).finally(() => {
      inflight = null
    })
    current = await inflight
    return current.accessToken
  }
}

export async function fetchAccount(provider: CloudProvider): Promise<Account> {
  return (await fetchToken(provider)).account
}

export function signIn(provider: CloudProvider, loginHint?: string) {
  const q = loginHint ? `?login_hint=${encodeURIComponent(loginHint)}` : ''
  window.location.assign(`/auth/${provider}/login${q}`)
}

export async function signOut(provider: CloudProvider) {
  await fetch(`/auth/${provider}/logout`, { method: 'POST', headers: HEADERS, credentials: 'same-origin' }).catch(
    () => {},
  )
}

export interface ProviderInfo {
  id: CloudProvider
  name: string
}

export async function fetchProviders(): Promise<ProviderInfo[] | null> {
  try {
    const res = await fetch('/auth/providers')
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
    return (await res.json()) as ProviderInfo[]
  } catch {
    return null
  }
}
