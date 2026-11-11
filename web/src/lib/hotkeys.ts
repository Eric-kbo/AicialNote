import { useEffect, useRef } from 'react'
import { isEditableTarget, isMac } from './utils'

/**
 * Keyboard shortcut. `combo` is like "j", "shift+n", "mod+k" (mod = ⌘ on
 * macOS, Ctrl elsewhere). Shortcuts without a modifier are ignored while the
 * user is typing in a field or a dialog is open.
 */
export function useHotkey(combo: string | string[], handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler)
  ref.current = handler
  const combos = Array.isArray(combo) ? combo : [combo]
  const key = combos.join('|')

  useEffect(() => {
    if (!enabled) return
    const parsed = key.split('|').map(parse)
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return
      for (const c of parsed) {
        if (!matches(c, e)) continue
        if (!c.mod && !c.alt) {
          if (isEditableTarget(e.target)) return
          if (document.querySelector('[role="dialog"], [role="menu"]')) return
        }
        e.preventDefault()
        ref.current(e)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, enabled])
}

interface Combo {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

function parse(combo: string): Combo {
  const parts = combo.toLowerCase().split('+')
  return {
    key: parts[parts.length - 1]!,
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  }
}

function matches(c: Combo, e: KeyboardEvent) {
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (c.mod !== mod || c.alt !== e.altKey) return false
  if (c.shift !== e.shiftKey && c.key.length > 1) return false
  if (c.shift && !e.shiftKey) return false
  return e.key.toLowerCase() === c.key
}
