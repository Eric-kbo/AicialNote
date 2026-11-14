import { ancestors, docToText, primaryValue, sectionOf } from '@aicialnote/core'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Command } from 'cmdk'
import {
  BookText,
  Check,
  ClipboardPaste,
  Download,
  FilePlus,
  FileText,
  Languages,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { useSortedItems, useVault } from '../data/vault'
import { htmlLang, LANGUAGES, languageNameIn, useI18n } from '../i18n'
import { toggleTheme } from '../lib/theme'
import { modKey } from '../lib/utils'
import { TemplateIcon } from './icons'
import { noteTitle, useNoteCommands } from './notes/commands'
import { Dialog } from './ui/dialog'
import { Kbd } from './ui/kbd'
import { requestNameFocus, useUI } from './ui-state'

export function CommandPalette() {
  const { t, locale, setLocale } = useI18n()
  const { paletteOpen, setPaletteOpen, openPaste, setDataDialog } = useUI()
  const items = useSortedItems() ?? []
  const { actions } = useVault()
  const navigate = useNavigate()
  const notes = useNoteCommands()
  const tree = notes.tree
  const pages = useMemo(() => {
    if (!tree) return []
    return [...tree.byId.values()]
      .filter((n) => n.kind === 'page')
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((page) => {
        const path = ancestors(tree, page.id).map((a) => noteTitle(a, t))
        return { page, path, text: docToText(page.content).slice(0, 400) }
      })
  }, [tree, t])
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const currentSection = (() => {
    const m = pathname.match(/^\/(s|p)\/([^/]+)/)
    if (!tree || !m) return undefined
    return m[1] === 's' ? m[2] : sectionOf(tree, m[2]!)?.id
  })()

  // The palette has a second page for picking a language, since a flat toggle doesn't scale past two.
  const [view, setView] = useState<'root' | 'language'>('root')
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const showView = (v: typeof view) => {
    setView(v)
    setSearch('')
    // Picking the item with the mouse moves focus off the input; bring it back so typing filters the new page.
    inputRef.current?.focus()
  }
  const onOpenChange = (open: boolean) => {
    setPaletteOpen(open)
    if (!open) showView('root')
  }
  const run = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }

  return (
    <Dialog open={paletteOpen} onOpenChange={onOpenChange} title={t('nav.search')} bare className="max-w-[620px]">
      <Command
        loop
        onKeyDown={(e) => {
          if (view !== 'root' && e.key === 'Backspace' && !search) {
            e.preventDefault()
            showView('root')
          }
        }}
        className="flex max-h-[60vh] flex-col"
        filter={(value, search, keywords) => {
          const hay = `${value} ${keywords?.join(' ') ?? ''}`.toLowerCase()
          return search
            .toLowerCase()
            .split(/\s+/)
            .every((w) => hay.includes(w))
            ? 1
            : 0
        }}
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-fg-3" />
          <Command.Input
            ref={inputRef}
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder={view === 'language' ? t('cmd.languageSearch') : t('cmd.placeholder')}
            className="h-full flex-1 bg-transparent text-[15px] outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <Command.List className="min-h-0 flex-1 overflow-auto p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-3">
          <Command.Empty className="py-10 text-center text-sm text-fg-3">{t('cmd.empty')}</Command.Empty>

          {view === 'language' && (
            <Command.Group heading={t('account.language')}>
              {LANGUAGES.map((l) => (
                <Command.Item
                  key={l.tag}
                  value={`language ${l.tag} ${l.name}`}
                  keywords={[languageNameIn(l.tag, locale), languageNameIn(l.tag, 'en')]}
                  onSelect={() => run(() => void setLocale(l.tag))}
                  className="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm data-[selected=true]:bg-hover"
                >
                  <span className="flex-1" lang={htmlLang(l.tag)}>
                    {l.name}
                  </span>
                  {l.tag !== locale && <span className="text-xs text-fg-3">{languageNameIn(l.tag, locale)}</span>}
                  {l.tag === locale && <Check className="size-3.5 text-accent" />}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {view === 'root' && (
            <Command.Group heading={t('cmd.actions')}>
              {currentSection && (
                <PaletteItem
                  icon={<FilePlus />}
                  onSelect={() => run(() => void notes.createPage({ sectionId: currentSection }))}
                >
                  {t('cmd.newPage')}
                </PaletteItem>
              )}
              <PaletteItem icon={<BookText />} onSelect={() => run(() => void notes.createNotebook())}>
                {t('cmd.newNotebook')}
              </PaletteItem>
              <PaletteItem
                icon={<Plus />}
                shortcut="N"
                onSelect={() =>
                  run(async () => {
                    const [item] = await actions.createItems([() => {}])
                    requestNameFocus(item!.id)
                    void navigate({ to: '/i/$id', params: { id: item!.id } })
                  })
                }
              >
                {t('list.empty.blank')}
              </PaletteItem>
              <PaletteItem icon={<ClipboardPaste />} shortcut={`${modKey}+V`} onSelect={() => run(() => openPaste())}>
                {t('list.paste')}
              </PaletteItem>
              <PaletteItem icon={<RefreshCw />} onSelect={() => run(() => actions.syncNow())}>
                {t('sync.now')}
              </PaletteItem>
              <PaletteItem icon={<Download />} onSelect={() => run(() => setDataDialog('export'))}>
                {t('data.export.menu')}
              </PaletteItem>
              <PaletteItem icon={<Upload />} onSelect={() => run(() => setDataDialog('import'))}>
                {t('data.import.menu')}
              </PaletteItem>
              <PaletteItem icon={<Moon />} onSelect={() => run(toggleTheme)}>
                {t('cmd.toggleTheme')}
              </PaletteItem>
              <PaletteItem icon={<Languages />} onSelect={() => showView('language')}>
                {t('cmd.language')}
              </PaletteItem>
            </Command.Group>
          )}

          {view === 'root' && pages.length > 0 && (
            <Command.Group heading={t('cmd.pages')}>
              {pages.map(({ page, path, text }) => (
                <Command.Item
                  key={page.id}
                  value={`page ${page.id} ${page.title}`}
                  keywords={[...path, text]}
                  onSelect={() => run(() => notes.openPage(page.id))}
                  className="flex h-10 items-center gap-3 rounded-md px-2.5 text-sm data-[selected=true]:bg-hover"
                >
                  <FileText className="size-4 shrink-0 text-fg-3" />
                  <span className="truncate font-medium">{noteTitle(page, t)}</span>
                  <span className="ml-auto truncate pl-4 text-xs text-fg-3">{path.join(' / ')}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {view === 'root' && items.length > 0 && (
            <Command.Group heading={t('cmd.items')}>
              {items.map((item) => {
                const primary = primaryValue(item)
                return (
                  <Command.Item
                    key={item.id}
                    value={`${item.displayId} ${item.name} ${primary}`}
                    keywords={[...item.tags, ...item.cards.map((c) => c.title)]}
                    onSelect={() => run(() => void navigate({ to: '/i/$id', params: { id: item.id } }))}
                    className="flex h-10 items-center gap-3 rounded-md px-2.5 text-sm data-[selected=true]:bg-hover"
                  >
                    <TemplateIcon template={item.cards[0]?.template} size="sm" />
                    <span className="w-[68px] shrink-0 font-mono text-xs text-fg-3">{item.displayId}</span>
                    <span className="truncate font-medium">{item.name || t('list.untitled')}</span>
                    <span className="ml-auto truncate pl-4 text-xs text-fg-3">{primary}</span>
                  </Command.Item>
                )
              })}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </Dialog>
  )
}

function PaletteItem(props: { icon: ReactNode; shortcut?: string; onSelect: () => void; children: string }) {
  return (
    <Command.Item
      value={props.children}
      onSelect={props.onSelect}
      className="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm data-[selected=true]:bg-hover [&>svg]:size-4 [&>svg]:text-fg-3"
    >
      {props.icon}
      <span className="flex-1">{props.children}</span>
      {props.shortcut && <Kbd>{props.shortcut}</Kbd>}
    </Command.Item>
  )
}
