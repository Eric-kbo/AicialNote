import {
  flattenPages,
  type Item,
  type Note,
  type PageRow,
  planIndent,
  planOutdent,
  type VaultMeta,
} from '@aicialnote/core'
import { ChevronDown, ChevronRight, FilePlus, FileText, KeyRound, Users } from 'lucide-react'
import { useState } from 'react'
import { useMeta } from '../../data/vault'
import { useI18n } from '../../i18n'
import { dragSourceProps, useDropTarget } from '../../lib/dnd'
import { useHotkey } from '../../lib/hotkeys'
import { setPrefs, toggleIn, usePrefs } from '../../lib/prefs'
import { cn } from '../../lib/utils'
import { StatusDot, TemplateIcon } from '../icons'
import { Button, IconButton } from '../ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../ui/menu'
import { noteTitle, useNoteCommands } from './commands'
import { SectionTab } from './NoteIcon'
import { NoteMenu } from './NoteMenu'

/**
 * Middle column: what a section holds, OneNote-style. Pages (with subpages),
 * account lists (with their accounts) and single accounts, all in one
 * ordered, collapsible list.
 */
export function PagesPane({
  section,
  activeId,
  newPageShortcut = true,
}: {
  section: Note
  activeId?: string
  newPageShortcut?: boolean
}) {
  const { t } = useI18n()
  const cmd = useNoteCommands()
  const prefs = usePrefs()
  const meta = useMeta()
  const tree = cmd.tree
  useHotkey('n', () => void cmd.createPage({ sectionId: section.id }), newPageShortcut)
  if (!tree) return null
  const rows = flattenPages(tree, section.id, new Set(prefs.collapsedPages))

  const focusRow = (id: string) =>
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-page-row="${id}"]`)?.focus())

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line" data-pages-pane>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
        <SectionTab color={section.color} />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{noteTitle(section, t)}</h2>
        <NewButton sectionId={section.id} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5" role="tree" aria-label={noteTitle(section, t)}>
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-fg-3">
            <p className="mb-1">{t('nb.sectionEmpty')}</p>
            <Button size="sm" variant="primary" onClick={() => void cmd.createPage({ sectionId: section.id })}>
              <FilePlus />
              {t('nb.newPage')}
            </Button>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => void cmd.createAccount(section.id)}>
                <KeyRound />
                {t('nb.newAccount')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void cmd.createAccountList(section.id)}>
                <Users />
                {t('nb.newAccountList')}
              </Button>
            </div>
          </div>
        )}
        {rows.map((row, i) => (
          <PageRowView
            key={row.page.id}
            row={row}
            meta={meta}
            active={row.page.id === activeId}
            collapsed={prefs.collapsedPages.includes(row.page.id)}
            onKey={(key) => {
              if (key === 'up' || key === 'down') {
                const next = rows[i + (key === 'up' ? -1 : 1)]
                if (next) {
                  cmd.openPage(next.page.id)
                  focusRow(next.page.id)
                }
              } else if (key === 'indent') {
                void cmd.indent(row.page.id).then(() => focusRow(row.page.id))
              } else if (key === 'outdent') {
                void cmd.outdent(row.page.id).then(() => focusRow(row.page.id))
              } else if (key === 'delete') {
                const next = rows[i + 1] ?? rows[i - 1]
                void cmd.remove(row.page)
                if (next && next.page.id !== row.page.id) {
                  cmd.openPage(next.page.id)
                  focusRow(next.page.id)
                } else cmd.openSection(section.id)
              }
            }}
          />
        ))}
      </div>
    </aside>
  )
}

/** "New page" with a menu for the other things a section can hold. */
function NewButton({ sectionId }: { sectionId: string }) {
  const { t } = useI18n()
  const cmd = useNoteCommands()
  return (
    <div className="flex items-center">
      <Button
        size="sm"
        variant="ghost"
        className="rounded-r-none pr-1.5 text-fg-2"
        onClick={() => void cmd.createPage({ sectionId })}
      >
        <FilePlus />
        {t('nb.newPage')}
      </Button>
      <Menu modal={false}>
        <MenuTrigger asChild>
          <IconButton label={t('nb.newMore')} tooltip={false} className="w-5 rounded-l-none">
            <ChevronDown />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
          <MenuItem icon={<FilePlus />} shortcut="N" onSelect={() => void cmd.createPage({ sectionId })}>
            {t('nb.newPage')}
          </MenuItem>
          <MenuItem icon={<KeyRound />} onSelect={() => void cmd.createAccount(sectionId)}>
            {t('nb.newAccount')}
          </MenuItem>
          <MenuItem icon={<Users />} onSelect={() => void cmd.createAccountList(sectionId)}>
            {t('nb.newAccountList')}
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  )
}

/** Small glyph that tells pages, account lists and accounts apart. */
function RowIcon({ page, item }: { page: Note; item?: Item }) {
  if (page.kind === 'account')
    return item?.cards[0] ? (
      <TemplateIcon template={item.cards[0].template} size="sm" />
    ) : (
      <KeyRound className="size-3.5 shrink-0 text-fg-3" />
    )
  if (page.kind === 'accountList') return <Users className="size-3.5 shrink-0 text-fg-3" />
  return <FileText className="size-3.5 shrink-0 text-fg-3" />
}

function PageRowView(props: {
  row: PageRow
  meta: VaultMeta | undefined
  active: boolean
  collapsed: boolean
  onKey: (key: 'up' | 'down' | 'indent' | 'outdent' | 'delete') => void
}) {
  const { page, depth, hasChildren } = props.row
  const { t } = useI18n()
  const cmd = useNoteCommands()
  const [menuOpen, setMenuOpen] = useState(false)
  const drop = useDropTarget({
    tree: cmd.tree,
    targetId: page.id,
    positions: ['before', 'after', 'inside'],
    onDrop: (id, pos) => void cmd.move(id, page.id, pos),
  })
  const tree = cmd.tree!
  const canIndent = planIndent(tree, page.id) !== null
  const canOutdent = planOutdent(tree, page.id) !== null
  const item = page.kind === 'account' ? tree.items.get(page.id) : undefined
  const status = item && props.meta?.statuses.find((s) => s.id === item.status)
  const count = page.kind === 'accountList' ? (tree.children.get(page.id)?.length ?? 0) : 0

  return (
    <div
      role="treeitem"
      aria-selected={props.active}
      aria-level={depth + 1}
      aria-expanded={hasChildren ? !props.collapsed : undefined}
      tabIndex={props.active ? 0 : -1}
      data-page-row={page.id}
      data-row-kind={page.kind}
      {...dragSourceProps(page.id)}
      {...drop.props}
      onClick={() => cmd.openPage(page.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuOpen(true)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        const map: Record<string, Parameters<typeof props.onKey>[0]> = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          Delete: 'delete',
        }
        let key = map[e.key]
        // Tab only indents when it can; otherwise it keeps moving focus as usual.
        if (e.key === 'Tab' && (e.shiftKey ? canOutdent : canIndent)) key = e.shiftKey ? 'outdent' : 'indent'
        if (!key) return
        e.preventDefault()
        e.stopPropagation()
        props.onKey(key)
      }}
      style={{ paddingLeft: 6 + depth * 18 }}
      className={cn(
        'group/row relative flex h-8 cursor-default items-center gap-1 rounded-md pr-1 text-sm outline-none select-none',
        'focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]',
        props.active ? 'bg-active text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg',
        depth === 0 && 'font-medium',
        drop.over === 'inside' && 'bg-accent-soft text-fg ring-1 ring-accent ring-inset',
      )}
    >
      {drop.over === 'before' && (
        <span
          className="pointer-events-none absolute top-0 right-1 h-0.5 rounded-full bg-accent"
          style={{ left: 6 + depth * 18 }}
        />
      )}
      {drop.over === 'after' && (
        <span
          className="pointer-events-none absolute right-1 bottom-0 h-0.5 rounded-full bg-accent"
          style={{ left: 6 + depth * 18 }}
        />
      )}
      {hasChildren ? (
        <button
          type="button"
          aria-label={props.collapsed ? t('nb.expand') : t('nb.collapse')}
          onClick={(e) => {
            e.stopPropagation()
            setPrefs((p) => ({ ...p, collapsedPages: toggleIn(p.collapsedPages, page.id) }))
          }}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-3 hover:bg-active hover:text-fg"
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-150', !props.collapsed && 'rotate-90')} />
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <RowIcon page={page} item={item} />
      <span className={cn('ml-1 min-w-0 flex-1 truncate', !page.title && 'text-fg-3')}>{noteTitle(page, t)}</span>
      {status && (
        <span title={status.label} className="flex shrink-0 group-hover/row:hidden">
          <StatusDot color={status.color} />
        </span>
      )}
      {page.kind === 'accountList' && (
        <span className="shrink-0 text-xs font-normal text-fg-3 tnum group-hover/row:hidden">{count}</span>
      )}
      <NoteMenu note={page} open={menuOpen} onOpenChange={setMenuOpen} canIndent={canIndent} canOutdent={canOutdent} />
    </div>
  )
}
