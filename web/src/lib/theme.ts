import { useSyncExternalStore } from 'react'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'aicialnote.theme'
const media = matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function read(): Theme {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

let current = read()

function apply() {
  const dark = current === 'dark' || (current === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
}

media.addEventListener('change', apply)

export function setTheme(t: Theme) {
  current = t
  if (t === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, t)
  apply()
  for (const l of listeners) l()
}

export function toggleTheme() {
  setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
