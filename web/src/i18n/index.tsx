import { fallbackChain } from '@aicialnote/core'
import { createContext, type ReactNode, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import { en } from './en'
import {
  htmlLang,
  intlTag,
  loadMessages,
  type Messages,
  matchLanguage,
  PSEUDO_TAG,
  pickLanguage,
  textDirection,
} from './languages'
import { formatMessage, pseudo, type Vars } from './message'
import { zh } from './zh'

export type MessageKey = keyof typeof zh
export type T = (key: MessageKey, vars?: Vars) => string
export { htmlLang, LANGUAGES, type Language, languageNameIn } from './languages'

const BUILT_IN: Record<string, Record<MessageKey, string>> = { zh, en }
const STORAGE_KEY = 'aicialnote.locale'

/** A language and its messages, complete: every key missing from a translation is filled from its fallbacks. */
interface Loaded {
  locale: string
  messages: Record<MessageKey, string>
}

async function load(locale: string): Promise<Loaded> {
  // `pt-BR` → en, then pt, then pt-BR on top; each later layer wins.
  const layers = await Promise.all(
    fallbackChain(locale === PSEUDO_TAG ? 'en' : locale)
      .reverse()
      .map(
        async (tag): Promise<Messages | undefined> => BUILT_IN[tag] ?? (await loadMessages(tag).catch(() => undefined)),
      ),
  )
  return { locale, messages: Object.assign({}, en, ...layers) }
}

/** The language to start with: the saved choice, else the browser's first language that is offered. */
export function loadInitialLanguage(): Promise<Loaded> {
  const saved = localStorage.getItem(STORAGE_KEY)
  const locale = saved ? matchLanguage(saved) : pickLanguage(navigator.languages ?? [navigator.language])
  return load(locale)
}

interface I18n {
  /** The UI language tag, e.g. `zh`, `en`, `pt-BR`. Also passed to core for the files written to the drive. */
  locale: string
  /** Tag for Intl formatters (`Intl.DateTimeFormat(intlLocale, …)`). */
  intlLocale: string
  dir: 'ltr' | 'rtl'
  setLocale: (l: string) => Promise<void>
  t: T
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ initial, children }: { initial: Loaded; children: ReactNode }) {
  const [state, setState] = useState(initial)
  const setLocale = useCallback(async (l: string) => {
    const next = await load(matchLanguage(l))
    localStorage.setItem(STORAGE_KEY, next.locale)
    setState(next)
  }, [])
  const { locale, messages } = state
  const dir = textDirection(locale)

  useLayoutEffect(() => {
    document.documentElement.lang = htmlLang(locale)
    document.documentElement.dir = dir
  }, [locale, dir])

  const value = useMemo<I18n>(() => {
    const intlLocale = intlTag(locale)
    const opts = locale === PSEUDO_TAG ? { text: pseudo } : undefined
    return {
      locale,
      intlLocale,
      dir,
      setLocale,
      t: (key, vars) => formatMessage(messages[key] ?? key, vars, intlLocale, opts),
    }
  }, [locale, messages, dir, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}

export function useT(): T {
  return useI18n().t
}
