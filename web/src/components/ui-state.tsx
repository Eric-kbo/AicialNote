import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

export interface Filters {
  q: string
  statuses: string[]
  templates: string[]
  tags: string[]
  expiring: boolean
}

export const emptyFilters: Filters = { q: '', statuses: [], templates: [], tags: [], expiring: false }

export function hasFilters(f: Filters) {
  return Boolean(f.q.trim() || f.statuses.length || f.templates.length || f.tags.length || f.expiring)
}

export interface PasteRequest {
  text?: string
  /** Add the result as a card to this item instead of creating new items. */
  targetItemId?: string
  /** File the new items into this account list (a notebook node). */
  targetListId?: string
}

interface UIState {
  filters: Filters
  setFilters: (f: Filters | ((f: Filters) => Filters)) => void
  /** Ids in the order the list currently shows them, for prev/next. */
  visibleIds: string[]
  setVisibleIds: (ids: string[]) => void
  paste: PasteRequest | null
  openPaste: (req?: PasteRequest) => void
  closePaste: () => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  /** The export or import dialog, opened from the account menu or Ctrl+K. */
  dataDialog: 'export' | 'import' | null
  setDataDialog: (d: 'export' | 'import' | null) => void
}

const Ctx = createContext<UIState | null>(null)

/**
 * UI state that outlives a single page: list filters survive opening an item,
 * and dialogs can be opened from anywhere.
 */
export function UIStateProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [visibleIds, setVisibleIds] = useState<string[]>([])
  const [paste, setPaste] = useState<PasteRequest | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [dataDialog, setDataDialog] = useState<'export' | 'import' | null>(null)

  const value = useMemo<UIState>(
    () => ({
      filters,
      setFilters,
      visibleIds,
      setVisibleIds,
      paste,
      openPaste: (req = {}) => setPaste(req),
      closePaste: () => setPaste(null),
      paletteOpen,
      setPaletteOpen,
      shortcutsOpen,
      setShortcutsOpen,
      dataDialog,
      setDataDialog,
    }),
    [filters, visibleIds, paste, paletteOpen, shortcutsOpen, dataDialog],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUI(): UIState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useUI outside UIStateProvider')
  return v
}

/** One-shot flag: focus the name field when the detail page opens. */
let focusNameFor: string | null = null
export function requestNameFocus(id: string) {
  focusNameFor = id
}
export function consumeNameFocus(id: string) {
  if (focusNameFor !== id) return false
  focusNameFor = null
  return true
}
