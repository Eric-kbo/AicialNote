/**
 * RFC 6238 TOTP on top of WebCrypto. Accepts either a bare base32 secret
 * ("JBSW Y3DP EHPK 3PXP") or an otpauth:// URI.
 */

export interface TotpConfig {
  secret: Uint8Array
  digits: number
  period: number
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512'
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Uint8Array | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) return null
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export function parseTotp(input: string): TotpConfig | null {
  const raw = input.trim()
  if (raw.toLowerCase().startsWith('otpauth://')) {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return null
    }
    const secret = base32Decode(url.searchParams.get('secret') ?? '')
    if (!secret || secret.length < 10) return null
    const algo = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace('SHA', 'SHA-')
    const digits = Number(url.searchParams.get('digits') ?? 6)
    const period = Number(url.searchParams.get('period') ?? 30)
    return {
      secret,
      digits: digits >= 6 && digits <= 8 ? digits : 6,
      period: period > 0 ? period : 30,
      algorithm: algo === 'SHA-256' || algo === 'SHA-512' ? algo : 'SHA-1',
    }
  }
  const secret = base32Decode(raw)
  // 80 bits is the minimum RFC 4226 recommends; anything shorter is a typo.
  if (!secret || secret.length < 10) return null
  return { secret, digits: 6, period: 30, algorithm: 'SHA-1' }
}

export function isTotpSecret(input: string): boolean {
  return parseTotp(input) !== null
}

export async function hotp(config: Omit<TotpConfig, 'period'>, counter: number): Promise<string> {
  const msg = new ArrayBuffer(8)
  const view = new DataView(msg)
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)
  const key = await crypto.subtle.importKey(
    'raw',
    config.secret as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: config.algorithm },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const offset = mac[mac.length - 1]! & 0x0f
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!
  return String(bin % 10 ** config.digits).padStart(config.digits, '0')
}

export interface TotpCode {
  code: string
  /** Seconds until the code rotates. */
  remaining: number
  period: number
}

export async function totp(input: string | TotpConfig, now = Date.now()): Promise<TotpCode | null> {
  const config = typeof input === 'string' ? parseTotp(input) : input
  if (!config) return null
  const seconds = Math.floor(now / 1000)
  const code = await hotp(config, Math.floor(seconds / config.period))
  return { code, remaining: config.period - (seconds % config.period), period: config.period }
}
