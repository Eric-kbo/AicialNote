import { matchLocale } from '@aicialnote/core'
import type { MessageKey } from '.'

export type Messages = Partial<Record<MessageKey, string>>

export interface Language {
  /** BCP 47 tag. `zh` means Simplified Chinese and is kept as is because saved preferences use it. */
  tag: string
  /** The language's name in that language, so a reader can find their own language in any UI language. */
  name: string
}

/** Tag of the development-only pseudo-locale (see `pseudo` in message.ts). */
export const PSEUDO_TAG = 'en-XA'

/**
 * Languages beyond the two built in, loaded on demand from `locales/<tag>.json`. A file that exists but is not
 * listed here is not offered in the language menu; a language listed here without a file is skipped.
 */
const EXTRA: Language[] = [
  { tag: 'zh-Hant', name: '繁體中文' },
  { tag: 'ja', name: '日本語' },
  { tag: 'ko', name: '한국어' },
  { tag: 'es', name: 'Español' },
  { tag: 'fr', name: 'Français' },
  { tag: 'de', name: 'Deutsch' },
  { tag: 'pt-BR', name: 'Português (Brasil)' },
  { tag: 'it', name: 'Italiano' },
  { tag: 'ru', name: 'Русский' },
  { tag: 'tr', name: 'Türkçe' },
  { tag: 'vi', name: 'Tiếng Việt' },
  { tag: 'id', name: 'Bahasa Indonesia' },
]

const loaders = import.meta.glob<Messages>('./locales/*.json', { import: 'default' })
const loaderFor = (tag: string) => loaders[`./locales/${tag}.json`]

/** Languages offered in the language menu, in this order. */
export const LANGUAGES: Language[] = [
  { tag: 'zh', name: '简体中文' },
  { tag: 'en', name: 'English' },
  ...EXTRA.filter((l) => loaderFor(l.tag)),
  ...(import.meta.env.DEV ? [{ tag: PSEUDO_TAG, name: 'Pseudo (en-XA)' }] : []),
]

const TAGS = LANGUAGES.map((l) => l.tag)

/** The best offered language for `tag` (from a saved preference or the browser). */
export function matchLanguage(tag: string): string {
  return matchLocale(tag, TAGS)
}

export function pickLanguage(preferred: readonly string[]): string {
  for (const tag of preferred) {
    const hit = matchLanguage(tag)
    // `matchLanguage` ends at English for anything unknown; keep looking for a better match first.
    if (hit !== 'en' || tag.toLowerCase().startsWith('en')) return hit
  }
  return 'en'
}

/** Loads the messages for a lazily loaded language; `undefined` for the built-in ones. */
export async function loadMessages(tag: string): Promise<Messages | undefined> {
  const load = loaderFor(tag)
  return load ? load() : undefined
}

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb'])

export function textDirection(tag: string): 'ltr' | 'rtl' {
  return RTL.has(tag.split('-')[0]!.toLowerCase()) ? 'rtl' : 'ltr'
}

/** The value for `<html lang>`, which also picks the right CJK glyphs and hyphenation. */
export function htmlLang(tag: string): string {
  return tag === 'zh' ? 'zh-CN' : tag
}

/** The tag to hand to Intl formatters. The pseudo-locale formats like English. */
export function intlTag(tag: string): string {
  return tag === PSEUDO_TAG ? 'en' : htmlLang(tag)
}

/** A language's name in the reader's language, used as a search keyword ("Japanese", "日语"). */
export function languageNameIn(tag: string, displayLocale: string): string {
  try {
    // `zh` is Simplified Chinese; asking for `zh-Hans` gives "Chinese (Simplified)" rather than "Chinese (China)".
    const named = tag === 'zh' ? 'zh-Hans' : tag === PSEUDO_TAG ? 'en' : tag
    return new Intl.DisplayNames([intlTag(displayLocale)], { type: 'language' }).of(named) ?? tag
  } catch {
    return tag
  }
}
