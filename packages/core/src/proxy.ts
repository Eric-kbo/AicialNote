import type { Card } from './schema'

/**
 * Proxy cards → the one-line formats proxy tools expect.
 *
 * The card keeps host, username and password in separate fields (see the
 * "proxy" template). Some users paste a whole proxy string into the address
 * field instead, so that is understood too.
 */

export interface ProxyParts {
  host: string
  port: string
  username: string
  password: string
  /** Scheme found in the address field ("socks5", "http" …), if any. */
  scheme?: string
}

export const PROXY_FORMATS = ['socks5', 'http', 'https', 'colon', 'at'] as const
export type ProxyFormat = (typeof PROXY_FORMATS)[number]

const HOST = String.raw`\[[0-9a-f:]+\]|[^\s:/@]+`
// scheme://user:pass@host:port, user:pass@host:port, host:port
const URI = new RegExp(
  String.raw`^(?:([a-z][a-z0-9+.-]*):\/\/)?(?:([^:@\s]*)(?::([^@\s]*))?@)?(${HOST})(?::(\d{1,5}))?\/?$`,
  'i',
)
// host:port:user:pass (the password may contain colons)
const COLON = new RegExp(String.raw`^(${HOST}):(\d{1,5}):([^:\s]+):(\S+)$`, 'i')

function decode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Splits whatever is in a proxy address field. Returns null when it isn't a host. */
export function parseProxy(input: string): ProxyParts | null {
  const v = input.trim()
  if (!v) return null
  const colon = v.match(COLON)
  if (colon) return { host: colon[1]!, port: colon[2]!, username: colon[3]!, password: colon[4]! }
  const uri = v.match(URI)
  if (!uri) return null
  return {
    scheme: uri[1]?.toLowerCase(),
    username: decode(uri[2] ?? ''),
    password: decode(uri[3] ?? ''),
    host: uri[4]!,
    port: uri[5] ?? '',
  }
}

/** The proxy described by a card, or null when it has no usable address. */
export function proxyFromCard(card: Card): ProxyParts | null {
  const field = (role: string) => card.fields.find((f) => f.role === role)?.value.trim() ?? ''
  const parts = parseProxy(field('host'))
  if (!parts) return null
  // Separate username/password fields win over credentials typed into the address.
  return {
    ...parts,
    username: field('username') || parts.username,
    password: field('password') || parts.password,
  }
}

/** One-line proxy string. URI forms percent-encode credentials so "@" or ":" in a password stay intact. */
export function formatProxy(p: ProxyParts, format: ProxyFormat): string {
  const hostPort = p.port ? `${p.host}:${p.port}` : p.host
  const hasAuth = Boolean(p.username || p.password)
  switch (format) {
    case 'colon':
      return hasAuth ? `${hostPort}:${p.username}:${p.password}` : hostPort
    case 'at':
      return hasAuth ? `${p.username}:${p.password}@${hostPort}` : hostPort
    default: {
      const auth = hasAuth
        ? `${encodeURIComponent(p.username)}${p.password ? `:${encodeURIComponent(p.password)}` : ''}@`
        : ''
      return `${format}://${auth}${hostPort}`
    }
  }
}

/** The format to suggest first: the scheme written in the card, if it is one we offer. */
export function defaultProxyFormat(p: ProxyParts): ProxyFormat | undefined {
  const s = p.scheme === 'socks5h' ? 'socks5' : p.scheme
  return PROXY_FORMATS.find((f) => f === s)
}
