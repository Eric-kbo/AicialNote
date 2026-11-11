import { useSyncExternalStore } from 'react'

/**
 * Per-device UI preferences (what is expanded, which page was open last).
 * Kept in localStorage, never written to the drive: they aren't user data.
 */
interface Prefs {
  /** Notebooks whose sections are hidden in the sidebar. */
  closedNotebooks: string[]
  /** Pages whose subpages are hidden. */
  collapsedPages: string[]
  /** Last page opened per section. */
  lastPage: Record<string, string>
  lastSection?: string
  sidebarHidden?: boolean
  /** Last format used by "copy proxy". */
  proxyFormat?: 'socks5' | 'http' | 'https' | 'colon' | 'at'
}

const KEY = 'aicialnote.prefs'
const empty: Prefs = { closedNotebooks: [], collapsedPages: [], lastPage: {} }

function load(): Prefs {
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) }
  } catch {
    return empty
  }
}

let prefs = load()
const listeners = new Set<() => void>()

export function getPrefs(): Prefs {
  return prefs
}

export function setPrefs(recipe: (p: Prefs) => Prefs) {
  prefs = recipe(prefs)
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Private mode or quota: preferences are a convenience.
  }
  for (const l of listeners) l()
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, getPrefs)
}

export function toggleIn(list: string[], id: string, on?: boolean): string[] {
  const has = list.includes(id)
  const want = on ?? !has
  if (want === has) return list
  return want ? [...list, id] : list.filter((x) => x !== id)
}
