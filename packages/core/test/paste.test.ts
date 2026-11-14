import { describe, expect, it } from 'vitest'
import { cardToText } from '../src/item'
import { entryToCard, guessName, guessTemplate, parsePaste } from '../src/paste'
import { createCard } from '../src/templates'

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
      // One field per line: the whole rest of the line is the value.
      password: 'p@ss w',
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

  it('reads a copied proxy card back without losing a line', () => {
    const text =
      '地址: 198.51.100.7:9004\n用户名: demo-user\n密码: demo-pass\n过期时间: 2026-12-12 20:29:04\n带宽: 10 Mbps'
    const e = parsePaste(text).entries[0]!
    expect(e.rest).toBe('')
    expect(e.values).toEqual([
      { role: 'host', value: '198.51.100.7:9004', label: '地址', type: 'text' },
      { role: 'username', value: 'demo-user', label: '用户名', type: 'text' },
      { role: 'password', value: 'demo-pass', label: '密码', type: 'password' },
      { role: 'expires', value: '2026-12-12 20:29:04', label: '过期时间', type: 'date' },
      { value: '10 Mbps', label: '带宽', type: 'text' },
    ])
    expect(guessTemplate(e)).toBe('proxy')
    const card = entryToCard(e, 'proxy', 'zh')
    expect(card.fields.map((f) => [f.label, f.value])).toEqual([
      ['地址', '198.51.100.7:9004'],
      ['用户名', 'demo-user'],
      ['密码', 'demo-pass'],
      ['地区', ''],
      ['过期时间', '2026-12-12 20:29:04'],
      ['带宽', '10 Mbps'],
    ])
  })

  it('round-trips every template through copy card', () => {
    for (const id of ['google', 'apple', 'openai', 'website', 'apikey', 'server', 'wifi', 'bank', 'address']) {
      for (const locale of ['zh', 'en', 'ja']) {
        const card = createCard(id, locale)
        card.fields.forEach((f, i) => {
          f.value =
            f.type === 'email'
              ? `u${i}@example.com`
              : f.type === 'totp'
                ? 'JBSWY3DPEHPK3PXP'
                : f.type === 'url'
                  ? 'https://example.com'
                  : f.type === 'date'
                    ? '2027-01-02'
                    : f.role === 'host'
                      ? '10.0.0.1'
                      : `v${i} x`
        })
        const e = parsePaste(cardToText(card)).entries[0]!
        expect(e.rest, `${id}/${locale}`).toBe('')
        expect(guessTemplate(e), `${id}/${locale}`).toBe(id)
        const back = entryToCard(e, id, locale)
        expect(back.fields.map((f) => [f.label, f.value, f.type, f.role])).toEqual(
          card.fields.map((f) => [f.label, f.value, f.type, f.role]),
        )
      }
    }
  })

  it('tells a proxy address from a postal address', () => {
    const e = parsePaste('收件人: 王五\n地址: 北京市朝阳区某路 1 号\n3 单元 502').entries[0]!
    expect(e.values.find((v) => v.label === '地址')).toMatchObject({
      role: 'address',
      value: '北京市朝阳区某路 1 号\n3 单元 502',
    })
    expect(e.rest).toBe('')
  })

  it('keeps the time of a labelled expiry date in running text', () => {
    expect(roles('账号 a@gmail.com 到期 2026-12-12 20:29:04 备注')).toMatchObject({ expires: '2026-12-12 20:29:04' })
    expect(roles('代理 1.2.3.4:8080 用户名 u1 地址 5.6.7.8:1080')).toMatchObject({ host: '1.2.3.4:8080' })
  })

  it('does not read login pairs or URLs as labels', () => {
    const r = parsePaste('alice:secret1\nbob:secret2\ncarol:secret3')
    expect(r.entries[0]!.values.every((v) => !v.label)).toBe(true)
    expect(parsePaste('https://example.com/login\nuser1 pass1').entries[0]!.values[0]).toEqual({
      role: 'url',
      value: 'https://example.com/login',
    })
    // a sentence with a colon stays in notes
    expect(parsePaste('Email: a@b.com\n温馨提示：首次登录后，请修改密码。').entries[0]!.rest).toBe(
      '温馨提示：首次登录后，请修改密码。',
    )
  })

  const fields = (text: string) => parsePaste(text).entries[0]!.values.map((v) => [v.label, v.value, v.role])

  it('reads a block of key-value lines with mixed separators', () => {
    const e = parsePaste('a:a1\nb:b1\nc c1\nd d1\ne e1').entries[0]!
    expect(e.values.map((v) => [v.label, v.value])).toEqual([
      ['a', 'a1'],
      ['b', 'b1'],
      ['c', 'c1'],
      ['d', 'd1'],
      ['e', 'e1'],
    ])
    expect(e.rest).toBe('')
    expect(guessTemplate(e)).toBe('custom')
    expect(entryToCard(e, 'custom', 'en').fields.map((f) => f.label)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('reads the common key-value notations', () => {
    expect(fields('host=1.2.3.4:8080\nuser=bob\npass=s3cret')).toEqual([
      ['host', '1.2.3.4:8080', 'host'],
      ['user', 'bob', 'username'],
      ['pass', 's3cret', 'password'],
    ])
    expect(fields('账号：a@b.com\n密码：x1\n备注码：abc')).toEqual([
      ['账号', 'a@b.com', 'account'],
      ['密码', 'x1', 'password'],
      ['备注码', 'abc', undefined],
    ])
    expect(fields('【账号】a@b.com\n【密码】x1')).toEqual([
      ['账号', 'a@b.com', 'account'],
      ['密码', 'x1', 'password'],
    ])
    expect(fields('- **Email**: a@b.com\n- Password: x1\n1. Port: 22')).toEqual([
      ['Email', 'a@b.com', 'account'],
      ['Password', 'x1', 'password'],
      ['Port', '22', undefined],
    ])
    expect(fields('export API_KEY="sk-1"\nexport BASE_URL=\'https://api.example.com\'')).toEqual([
      ['API_KEY', 'sk-1', undefined],
      ['BASE_URL', 'https://api.example.com', 'url'],
    ])
    expect(fields('Region -> US\nPlan -> Pro')).toEqual([
      ['Region', 'US', 'region'],
      ['Plan', 'Pro', undefined],
    ])
    expect(fields('recovery_email: r@x.com\nrecoveryEmail2: s@x.com')[0]).toEqual([
      'recovery_email',
      'r@x.com',
      'recovery',
    ])
  })

  it('joins a separate proxy port into the address, and tells servers apart', () => {
    const e = parsePaste('IP: 1.2.3.4\n端口: 8080\n账号: u1\n密码: p1').entries[0]!
    expect(guessTemplate(e)).toBe('proxy')
    const card = entryToCard(e, 'proxy', 'zh')
    expect(card.fields.find((f) => f.role === 'host')!.value).toBe('1.2.3.4:8080')
    expect(card.fields.some((f) => f.label === '端口')).toBe(false)
    expect(card.fields.find((f) => f.role === 'username')!.value).toBe('u1')

    const s = parsePaste('服务器: 10.0.0.2\n端口: 22\n用户名: root').entries[0]!
    expect(guessTemplate(s)).toBe('server')
    expect(entryToCard(s, 'server', 'zh').fields.map((f) => [f.label, f.value])).toContainEqual(['端口', '22'])
  })

  it('splits several pairs on one line', () => {
    expect(fields('a=1; b=2; c=3')).toEqual([
      ['a', '1', undefined],
      ['b', '2', undefined],
      ['c', '3', undefined],
    ])
    expect(fields('Email:a@b.com Password:x1')).toEqual([
      ['Email', 'a@b.com', 'account'],
      ['Password', 'x1', 'password'],
    ])
  })

  it('reads JSON objects and arrays', () => {
    expect(
      fields('{"email": "a@b.com", "password": "x1", "proxy": {"host": "1.2.3.4:1080"}, "tags": ["a", "b"]}'),
    ).toEqual([
      ['email', 'a@b.com', 'account'],
      ['password', 'x1', 'password'],
      ['proxy.host', '1.2.3.4:1080', 'host'],
      ['tags', 'a, b', undefined],
    ])
    const r = parsePaste('[{"email": "a@b.com", "password": "1"}, {"email": "c@d.com", "password": "2"}]')
    expect(r.mode).toBe('bulk')
    expect(r.entries.map((e) => e.values.map((v) => v.value))).toEqual([
      ['a@b.com', '1'],
      ['c@d.com', '2'],
    ])
  })

  it('reads "copy all" back with its name and notes', () => {
    const text = 'My Google\n\n[Google]\n邮箱: a@gmail.com\n密码: x1\n\n首次登录 请改密码'
    const e = parsePaste(text).entries[0]!
    expect(e.name).toBe('My Google')
    expect(guessName(e)).toBe('My Google')
    expect(e.values.map((v) => v.role)).toEqual(['account', 'password'])
    expect(e.rest).toBe('首次登录 请改密码')
  })

  it('keeps plain login pairs as bulk records', () => {
    expect(parsePaste('alice secret1\nbob secret2').mode).toBe('bulk')
    expect(parsePaste('alice:secret1\nbob:secret2').entries[0]!.values.every((v) => !v.label)).toBe(true)
    expect(parsePaste('a@gmail.com\tpw1\nb@gmail.com\tpw2').mode).toBe('bulk')
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

  it('drops the template slots the paste left empty, in template order', () => {
    const entry = parsePaste('a@gmail.com----pw').entries[0]!
    const card = entryToCard(entry, 'google', 'zh')
    expect(card.fields.map((f) => [f.role, f.value])).toEqual([
      ['account', 'a@gmail.com'],
      ['password', 'pw'],
    ])
  })

  it('keeps the whole template when nothing was recognised', () => {
    const card = entryToCard({ values: [], rest: '随便一段话' }, 'bank', 'zh')
    expect(card.fields.map((f) => f.label)).toEqual(['银行', '卡号', '持卡人', '有效期', 'CVV', '取款密码', '手机号'])
  })

  it('custom cards only contain parsed values', () => {
    const entry = { values: [{ role: 'phone' as const, value: '+44 20 7946 0000' }], rest: '' }
    const card = entryToCard(entry, 'custom', 'en')
    expect(card.fields).toHaveLength(1)
    expect(card.fields[0]).toMatchObject({ label: 'Phone', type: 'phone' })
  })
})
