import { Link, Outlet } from '@tanstack/react-router'
import { PanelLeft, Search } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useNoteTree, useSyncStatus, useVault } from '../data/vault'
import { useI18n } from '../i18n'
import { useHotkey } from '../lib/hotkeys'
import { setPrefs, usePrefs } from '../lib/prefs'
import { isEditableTarget, modKey } from '../lib/utils'
import { useSession } from '../session'
import { AccountMenu } from './AccountMenu'
import { CommandPalette } from './CommandPalette'
import { DataDialogs } from './DataDialogs'
import { Logo } from './icons'
import { Sidebar } from './notes/Sidebar'
import { PasteDialog } from './PasteDialog'
import { ShortcutsDialog } from './ShortcutsDialog'
import { SyncIndicator } from './SyncIndicator'
import { IconButton } from './ui/button'
import { Kbd } from './ui/kbd'
import { useUI } from './ui-state'

export function AppShell() {
  const { t } = useI18n()
  const { setPaletteOpen, setShortcutsOpen, openPaste, paste } = useUI()
  const status = useSyncStatus()
  const { reauth } = useSession()
  const { connection } = useVault()

  useHotkey('mod+k', () => setPaletteOpen(true))
  useHotkey('?', () => setShortcutsOpen(true))
  const { sidebarHidden } = usePrefs()
  const tree = useNoteTree()
  const treeRef = useRef(tree)
  treeRef.current = tree
  const toggleSidebar = () => setPrefs((p) => ({ ...p, sidebarHidden: !p.sidebarHidden }))
  useHotkey('mod+\\', toggleSidebar)

  // Ctrl+V anywhere outside a text field: smart paste. On a detail page the
  // result becomes a new card of that item.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || paste || document.querySelector('[role="dialog"]')) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text.trim()) return
      // In notebooks it depends on what is open: an account gets a new card, an
      // account list gets new accounts, and a page keeps the paste for its editor.
      const node = window.location.pathname.match(/^\/p\/([^/]+)/)?.[1]
      const kind = node ? treeRef.current?.byId.get(node)?.kind : undefined
      if (/^\/(notes|s|p)(\/|$)/.test(window.location.pathname) && kind !== 'account' && kind !== 'accountList') return
      e.preventDefault()
      if (kind === 'accountList') return openPaste({ text, targetListId: node })
      const m = window.location.pathname.match(/^\/(i|p)\/([^/]+)/)
      openPaste({ text, targetItemId: m?.[2] })
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [openPaste, paste])

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface/60 px-3">
        <IconButton label={t('nav.toggleSidebar')} shortcut={`${modKey}+\\`} onClick={toggleSidebar}>
          <PanelLeft />
        </IconButton>
        <Link to="/" className="flex items-center gap-2 rounded-md py-1 pr-2 pl-1 hover:bg-hover">
          <Logo className="size-[22px] text-fg" />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">AicialNote</span>
        </Link>
        {connection.kind === 'demo' && (
          <span className="rounded bg-[color-mix(in_oklab,var(--st-yellow)_14%,transparent)] px-1.5 py-0.5 text-2xs font-medium text-st-yellow">
            DEMO
          </span>
        )}

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-auto hidden h-8 w-full max-w-[420px] items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-sm text-fg-3 hover:border-line-strong md:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">{t('nav.search')}</span>
          <Kbd>{`${modKey}+K`}</Kbd>
        </button>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <SyncIndicator />
          <AccountMenu />
        </div>
      </header>

      {status.phase === 'auth' && (
        <div className="flex h-10 shrink-0 items-center justify-center gap-3 border-b border-line bg-[color-mix(in_oklab,var(--st-yellow)_10%,var(--surface))] text-sm">
          {status.missingScope ? t('sync.authScope') : t('sync.auth')}
          <button type="button" onClick={reauth} className="font-medium text-accent hover:underline">
            {t('sync.reauth')}
          </button>
        </div>
      )}
      {status.phase === 'blocked' && (
        <div className="flex h-10 shrink-0 items-center justify-center border-b border-line bg-[color-mix(in_oklab,var(--st-red)_8%,var(--surface))] text-sm text-st-red">
          {t('sync.newer')}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!sidebarHidden && <Sidebar />}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
      <PasteDialog />
      <ShortcutsDialog />
      <DataDialogs />
    </div>
  )
}
