import { describe, expect, it } from 'vitest'
import { base32Decode, parseTotp, totp } from '../src/totp'

// RFC 6238 Appendix B, secret = ASCII "12345678901234567890"
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totp', () => {
  it('decodes base32 with spaces and lowercase', () => {
    expect(base32Decode('mzxw 6ytb oi')).toEqual(new TextEncoder().encode('foobar'))
    expect(base32Decode('not base32!')).toBeNull()
  })

  it('matches RFC 6238 test vectors', async () => {
    const config = { ...parseTotp(RFC_SECRET)!, digits: 8 }
    expect((await totp(config, 59_000))!.code).toBe('94287082')
    expect((await totp(config, 1_111_111_109_000))!.code).toBe('07081804')
    expect((await totp(config, 2_000_000_000_000))!.code).toBe('69279037')
  })

  it('reports seconds remaining', async () => {
    const r = await totp(RFC_SECRET, 65_000)
    expect(r!.code).toHaveLength(6)
    expect(r!.remaining).toBe(25)
  })

  it('parses otpauth URIs', () => {
    const c = parseTotp(`otpauth://totp/Example:a@b.com?secret=${RFC_SECRET}&digits=8&period=60&algorithm=SHA256`)
    expect(c).toMatchObject({ digits: 8, period: 60, algorithm: 'SHA-256' })
  })

  it('rejects short or invalid secrets', () => {
    expect(parseTotp('ABC')).toBeNull()
    expect(parseTotp('hello world')).toBeNull()
  })
})
