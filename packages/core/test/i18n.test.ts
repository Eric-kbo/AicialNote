import { describe, expect, it } from 'vitest'
import { fallbackChain, fileStrings, type Localized, matchLocale, pick, pickPath, resolveLocale } from '../src/i18n'
import { DRIVE_TRANSLATIONS } from '../src/locales'
import { parseVaultMeta } from '../src/schema'
import { createCard, createVaultMeta, defaultStatuses, ROLE_DEFAULTS, TEMPLATES } from '../src/templates'

describe('fallbackChain', () => {
  it('goes from specific to general and always ends at English', () => {
    expect(fallbackChain('pt-BR')).toEqual(['pt-BR', 'pt', 'en'])
    expect(fallbackChain('ja')).toEqual(['ja', 'en'])
    expect(fallbackChain('en')).toEqual(['en'])
  })

  it('maps Chinese regions to a script', () => {
    expect(fallbackChain('zh-TW')).toEqual(['zh-TW', 'zh-Hant', 'zh', 'en'])
    expect(fallbackChain('zh-HK')).toEqual(['zh-HK', 'zh-Hant', 'zh', 'en'])
    expect(fallbackChain('zh-CN')).toEqual(['zh-CN', 'zh-Hans', 'zh', 'en'])
    expect(fallbackChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh', 'en'])
  })

  it('survives tags that are not valid BCP 47', () => {
    const chain = fallbackChain('not a tag')
    expect(chain[0]).toBe('not a tag')
    expect(chain.at(-1)).toBe('en')
  })
})

describe('matchLocale', () => {
  it('picks the most specific supported tag', () => {
    expect(matchLocale('zh-TW', ['en', 'zh', 'zh-Hant'])).toBe('zh-Hant')
    expect(matchLocale('zh-SG', ['en', 'zh', 'zh-Hant'])).toBe('zh')
    expect(matchLocale('pt-BR', ['en', 'pt'])).toBe('pt')
    expect(matchLocale('fr-CA', ['en', 'de'])).toBe('en')
  })

  it('ignores case', () => {
    expect(matchLocale('PT-br', ['en', 'pt-BR'])).toBe('pt-BR')
  })
})

/** Every English string AicialNote writes into a drive as a label. Brand names (same in zh and en) aren't translated. */
function driveSources(): Set<string> {
  const out = new Set<string>()
  const add = (l: Localized) => {
    if (l.zh !== l.en) out.add(l.en)
  }
  const paths = new Set<string>(['allItemsCsv', 'notesFolder'])
  for (const [key, l] of Object.entries(fileStrings)) if (!paths.has(key)) add(l)
  for (const t of TEMPLATES) {
    add(t.name)
    for (const f of t.fields) add(f.label)
  }
  for (const d of Object.values(ROLE_DEFAULTS)) add(d.label)
  for (const s of defaultStatuses('en')) out.add(s.label)
  return out
}

describe('strings written to the drive', () => {
  const sources = driveSources()

  for (const [tag, table] of Object.entries(DRIVE_TRANSLATIONS)) {
    it(`${tag}: translates every label and nothing else`, () => {
      expect(Object.keys(table).sort(), tag).toEqual([...sources].sort())
      for (const [en, value] of Object.entries(table)) expect(value.trim(), `${tag} ${en}`).not.toBe('')
    })
  }

  it('use the translation along the fallback chain', () => {
    const ja = DRIVE_TRANSLATIONS.ja!
    expect(pick(fileStrings.status, 'ja')).toBe(ja.Status)
    expect(pick(fileStrings.status, 'ja-JP')).toBe(ja.Status)
    expect(defaultStatuses('ja').map((s) => s.label)).toEqual(
      ['Active', 'Setting up', 'Needs attention', 'Banned', 'Retired'].map((en) => ja[en]),
    )
    expect(createCard('google', 'ja').fields.map((f) => f.label)).toContain(ja.Password)
    // Traditional Chinese for Taiwan and Hong Kong, Simplified Chinese stays as written inline.
    expect(pick(fileStrings.status, 'zh-TW')).toBe(DRIVE_TRANSLATIONS['zh-Hant']!.Status)
    expect(pick(fileStrings.status, 'zh-HK')).toBe(DRIVE_TRANSLATIONS['zh-Hant']!.Status)
    expect(pick(fileStrings.status, 'zh-CN')).toBe('状态')
    expect(pick(fileStrings.status, 'pt-BR')).toBe(DRIVE_TRANSLATIONS['pt-BR']!.Status)
  })

  it('fall back to English for languages without translations, and keep brand names', () => {
    expect(pick(fileStrings.status, 'pl')).toBe('Status')
    expect(defaultStatuses('pl')).toEqual(defaultStatuses('en'))
    expect(createCard('google', 'ja').title).toBe('Google')
  })

  it('never translate path names beyond zh and en', () => {
    expect(resolveLocale('ja')).toBe('en')
    for (const tag of Object.keys(DRIVE_TRANSLATIONS)) {
      expect(pickPath(fileStrings.allItemsCsv, tag), tag).toBe(tag.startsWith('zh') ? '全部账号.csv' : 'all-items.csv')
      expect(pickPath(fileStrings.notesFolder, tag), tag).toBe(tag.startsWith('zh') ? '笔记' : 'notes')
    }
  })
})

describe('vault.json locale', () => {
  it('keeps a language this version does not know', () => {
    const meta = parseVaultMeta(JSON.stringify(createVaultMeta('ja')))
    expect(meta.locale).toBe('ja')
    expect(JSON.parse(JSON.stringify(meta)).locale).toBe('ja')
  })

  it('still defaults to zh when the key is missing', () => {
    const { locale: _, ...rest } = createVaultMeta('en')
    expect(parseVaultMeta(JSON.stringify(rest)).locale).toBe('zh')
  })
})
