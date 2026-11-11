import type { Locale } from '@aicialnote/core'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { en } from './en'
import { zh } from './zh'

export type MessageKey = keyof typeof zh
type Vars = Record<string, string | number>
export type T = (key: MessageKey, vars?: Vars) => string

const dictionaries: Record<Locale, Record<MessageKey, string>> = { zh, en }
const STORAGE_KEY = 'aicialnote.locale'

function initialLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'zh' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function format(template: string, vars?: Vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))
}

interface I18n {
  locale: Locale
  setLocale: (l: Locale) => void
  t: T
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l)
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
    setLocaleState(l)
  }, [])
  const value = useMemo<I18n>(() => {
    const dict = dictionaries[locale]
    return { locale, setLocale, t: (key, vars) => format(dict[key] ?? key, vars) }
  }, [locale, setLocale])
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
