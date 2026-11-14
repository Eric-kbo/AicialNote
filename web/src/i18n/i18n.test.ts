import { describe, expect, it } from 'vitest'
import { en } from './en'
import { formatMessage, MessageSyntaxError, messageVars, pseudo } from './message'
import { zh } from './zh'

describe('formatMessage', () => {
  it('fills simple arguments and leaves unknown ones visible', () => {
    expect(formatMessage('Hi {name}', { name: 'Ann' }, 'en')).toBe('Hi Ann')
    expect(formatMessage('Hi {name}', {}, 'en')).toBe('Hi {name}')
  })

  it('picks the plural branch for the language', () => {
    const m = '{n, plural, one {# file} other {# files}}'
    expect(formatMessage(m, { n: 1 }, 'en')).toBe('1 file')
    expect(formatMessage(m, { n: 2 }, 'en')).toBe('2 files')
    expect(formatMessage(m, { n: 1234 }, 'en')).toBe('1,234 files')
    // Russian has one / few / many.
    const ru = '{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}'
    expect([1, 3, 5, 21].map((n) => formatMessage(ru, { n }, 'ru'))).toEqual([
      '1 файл',
      '3 файла',
      '5 файлов',
      '21 файл',
    ])
  })

  it('prefers an exact match and allows nested arguments', () => {
    const m = '{n, plural, =0 {Nothing in {place}} one {# thing in {place}} other {# things in {place}}}'
    expect(formatMessage(m, { n: 0, place: 'A' }, 'en')).toBe('Nothing in A')
    expect(formatMessage(m, { n: 1, place: 'A' }, 'en')).toBe('1 thing in A')
  })

  it('shows a malformed message as written instead of throwing', () => {
    expect(formatMessage('{n, plural, one {x}', { n: 1 }, 'en')).toBe('{n, plural, one {x}')
    expect(() => messageVars('{n, plural, one {x}}')).toThrow(MessageSyntaxError)
  })

  it('applies the text transform to the message only, not to values', () => {
    const out = formatMessage('Hi {name}', { name: 'Ann' }, 'en', { text: pseudo })
    expect(out).toContain('Ann')
    expect(out).toMatch(/^⟦Ħī ·+⟧Ann$/)
  })
})

const translations = import.meta.glob<Record<string, string>>('./locales/*.json', { eager: true, import: 'default' })

describe('message catalogs', () => {
  const keys = Object.keys(zh) as (keyof typeof zh)[]

  it('zh and en parse and use the same arguments', () => {
    for (const key of keys) {
      expect([...messageVars(en[key])].sort(), `en ${key}`).toEqual([...messageVars(zh[key])].sort())
    }
  })

  for (const [path, messages] of Object.entries(translations)) {
    const tag = path.slice('./locales/'.length, -'.json'.length)
    it(`${tag}: only known keys, valid syntax, no unknown arguments`, () => {
      for (const [key, value] of Object.entries(messages)) {
        expect(key in zh, `${tag}: unknown key ${key}`).toBe(true)
        expect(typeof value, `${tag} ${key}`).toBe('string')
        const allowed = messageVars(en[key as keyof typeof en])
        for (const v of messageVars(value)) expect(allowed.has(v), `${tag} ${key}: unknown argument {${v}}`).toBe(true)
      }
    })
  }

  it('reports coverage when I18N_REPORT is set', () => {
    if (!import.meta.env.I18N_REPORT) return
    const rows = Object.entries(translations).map(([path, messages]) => {
      const missing = keys.filter((k) => !(k in messages))
      return { locale: path.slice(10, -5), done: `${keys.length - missing.length}/${keys.length}`, missing }
    })
    for (const r of rows) {
      console.info(`${r.locale}: ${r.done}${r.missing.length ? `\n  missing: ${r.missing.join(', ')}` : ''}`)
    }
    if (!rows.length) console.info('No translations in web/src/i18n/locales/ yet.')
  })
})
