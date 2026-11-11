import { describe, expect, it } from 'vitest'
import { formatProxy, parseProxy, proxyFromCard } from '../src/proxy'
import { createCard } from '../src/templates'

function proxyCard(host: string, username = '', password = '') {
  const card = createCard('proxy', 'zh')
  const set = (role: string, v: string) => {
    const f = card.fields.find((x) => x.role === role)
    if (f) f.value = v
  }
  set('host', host)
  set('username', username)
  set('password', password)
  return card
}

describe('proxy formats', () => {
  it('builds every format from a card', () => {
    const p = proxyFromCard(proxyCard('1.2.3.4:1080', 'user', 'pass'))!
    expect(formatProxy(p, 'socks5')).toBe('socks5://user:pass@1.2.3.4:1080')
    expect(formatProxy(p, 'http')).toBe('http://user:pass@1.2.3.4:1080')
    expect(formatProxy(p, 'https')).toBe('https://user:pass@1.2.3.4:1080')
    expect(formatProxy(p, 'colon')).toBe('1.2.3.4:1080:user:pass')
    expect(formatProxy(p, 'at')).toBe('user:pass@1.2.3.4:1080')
  })

  it('encodes special characters in URI forms only', () => {
    const p = proxyFromCard(proxyCard('proxy.example.com:8000', 'a@b', 'p:w/d'))!
    expect(formatProxy(p, 'socks5')).toBe('socks5://a%40b:p%3Aw%2Fd@proxy.example.com:8000')
    expect(formatProxy(p, 'colon')).toBe('proxy.example.com:8000:a@b:p:w/d')
  })

  it('works without credentials', () => {
    const p = proxyFromCard(proxyCard('1.2.3.4:8080'))!
    expect(formatProxy(p, 'socks5')).toBe('socks5://1.2.3.4:8080')
    expect(formatProxy(p, 'colon')).toBe('1.2.3.4:8080')
  })

  it('understands whole proxy strings typed into the address field', () => {
    expect(parseProxy('socks5://u:p%40ss@1.2.3.4:1080')).toEqual({
      scheme: 'socks5',
      username: 'u',
      password: 'p@ss',
      host: '1.2.3.4',
      port: '1080',
    })
    expect(parseProxy('1.2.3.4:8080:user:pa:ss')).toMatchObject({ username: 'user', password: 'pa:ss' })
    const p = proxyFromCard(proxyCard('http://old:old@1.2.3.4:3128', 'new', 'secret'))!
    expect(formatProxy(p, 'http')).toBe('http://new:secret@1.2.3.4:3128')
    expect(proxyFromCard(proxyCard(''))).toBeNull()
    expect(parseProxy('not a proxy at all')).toBeNull()
  })
})

describe('pasting a proxy URI', () => {
  it('keeps the scheme in the address and not in the name', async () => {
    const { guessName, parsePaste } = await import('../src/paste')
    const entry = parsePaste('socks5://u:p@1.2.3.4:1080').entries[0]!
    expect(guessName(entry)).toBe('1.2.3.4:1080')
  })
})
