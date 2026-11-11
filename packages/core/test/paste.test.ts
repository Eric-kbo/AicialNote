import { describe, expect, it } from 'vitest'
import { entryToCard, guessName, guessTemplate, parsePaste } from '../src/paste'

const roles = (text: string) => Object.fromEntries(parsePaste(text).entries[0]!.values.map((v) => [v.role, v.value]))

describe('parsePaste', () => {
  it('parses labelled text from a message and keeps the rest as notes', () => {
    const text =
      '账号 linda.russo.demo@gmail.com 密码 Kx92!mq 辅助邮箱 lr.backup.demo@outlook.com 温馨提示 首次登录后请注意，' +
      '修改密码、绑定辅助邮箱、添加验证手机。谷歌2fa身份验证器教程 https://docs.qq.com/doc/abc'
    const r = parsePaste(text)
    expect(r.mode).toBe('single')
    const e = r.entries[0]!
    expect(Object.fromEntries(e.values.map((v) => [v.role, v.value]))).toEqual({
      account: 'linda.russo.demo@gmail.com',
      password: 'Kx92!mq',
      recovery: 'lr.backup.demo@outlook.com',
    })
    expect(e.rest).toContain('温馨提示 首次登录后请注意')
    expect(e.rest).toContain('https://docs.qq.com/doc/abc')
    expect(guessTemplate(e)).toBe('google')
    expect(guessName(e)).toBe('linda.russo.demo')
  })

  it('parses labels with colons', () => {
    expect(roles('Email: a@b.com\nPassword: p@ss w\n2FA: JBSWY3DPEHPK3PXP')).toMatchObject({
      account: 'a@b.com',
      password: 'p@ss',
      totp: 'JBSWY3DPEHPK3PXP',
    })
  })

  it('parses a ---- delimited line by value shape', () => {
    expect(roles('abc@gmail.com----Pass123----rec@outlook.com----JBSWY3DPEHPK3PXPJBSWY3DP')).toEqual({
      account: 'abc@gmail.com',
      password: 'Pass123',
      recovery: 'rec@outlook.com',
      totp: 'JBSWY3DPEHPK3PXPJBSWY3DP',
    })
  })

  it('treats a numeric password after the account as password, not phone', () => {
    expect(roles('abc@gmail.com----12345678')).toEqual({ account: 'abc@gmail.com', password: '12345678' })
  })

  it('parses bulk lines', () => {
    const r = parsePaste('a@gmail.com|p1\nb@gmail.com|p2\nc@gmail.com|p3')
    expect(r.mode).toBe('bulk')
    expect(r.entries).toHaveLength(3)
    expect(r.entries[2]!.values).toEqual([
      { role: 'account', value: 'c@gmail.com' },
      { role: 'password', value: 'p3' },
    ])
  })

  it('parses proxy formats', () => {
    expect(roles('1.2.3.4:8080:user1:secret')).toEqual({ host: '1.2.3.4:8080', username: 'user1', password: 'secret' })
    expect(roles('user1:secret@1.2.3.4:8080')).toEqual({ host: '1.2.3.4:8080', username: 'user1', password: 'secret' })
    expect(roles('1.2.3.4:8080 user1 secret 2026-12-01')).toEqual({
      host: '1.2.3.4:8080',
      username: 'user1',
      password: 'secret',
      expires: '2026-12-01',
    })
    expect(guessTemplate(parsePaste('1.2.3.4:8080:u:p').entries[0]!)).toBe('proxy')
    // the scheme stays in the address, so copying can offer the same format back
    expect(roles('SOCKS5://user1:secret@1.2.3.4:1080')).toEqual({
      host: 'socks5://1.2.3.4:1080',
      username: 'user1',
      password: 'secret',
    })
  })

  it('does not treat words glued to running text as labels', () => {
    const r = roles('账号 a@gmail.com 密码 Pw1 温馨提示 固定设备+稳定一个地区IP使用约7天')
    expect(r).toEqual({ account: 'a@gmail.com', password: 'Pw1' })
    expect(roles('账号 a@gmail.com 地区：美国')).toMatchObject({ region: '美国' })
  })

  it('parses bulk lines with mixed shapes', () => {
    const r = parsePaste('a1@gmail.com----Pw1----a1.rec@outlook.com\na2@gmail.com Pw2\n198.51.100.9:8001:pxuser:pxpass')
    expect(r.mode).toBe('bulk')
    expect(r.entries.map((e) => e.values.map((v) => v.role))).toEqual([
      ['account', 'password', 'recovery'],
      ['account', 'password'],
      ['host', 'username', 'password'],
    ])
  })

  it('keeps one value per line as a single entry', () => {
    const r = parsePaste('a@gmail.com\nPass123')
    expect(r.mode).toBe('single')
    expect(r.entries[0]!.values).toEqual([
      { role: 'account', value: 'a@gmail.com' },
      { role: 'password', value: 'Pass123' },
    ])
  })

  it('returns nothing for empty input', () => {
    expect(parsePaste('   ').entries).toEqual([])
  })
})

describe('entryToCard', () => {
  it('fills template slots and appends extras', () => {
    const entry = parsePaste('a@gmail.com----pw----+1 415 555 0100').entries[0]!
    const card = entryToCard(entry, 'google', 'zh')
    const byRole = Object.fromEntries(card.fields.map((f) => [f.role, f.value]))
    expect(byRole).toMatchObject({ account: 'a@gmail.com', password: 'pw', phone: '+1 415 555 0100' })
    expect(card.title).toBe('Google')
  })

  it('maps username onto an account slot when the template has no username', () => {
    const entry = { values: [{ role: 'username' as const, value: 'bob' }], rest: '' }
    const card = entryToCard(entry, 'website', 'en')
    expect(card.fields.find((f) => f.role === 'account')!.value).toBe('bob')
  })

  it('custom cards only contain parsed values', () => {
    const entry = { values: [{ role: 'phone' as const, value: '+44 20 7946 0000' }], rest: '' }
    const card = entryToCard(entry, 'custom', 'en')
    expect(card.fields).toHaveLength(1)
    expect(card.fields[0]).toMatchObject({ label: 'Phone', type: 'phone' })
  })
})
