import { childrenOf, type Note, sectionOf } from '@aicialnote/core'
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronRight, KeyRound, Plus } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useItems } from '../../data/vault'
import { useI18n } from '../../i18n'
import { dragSourceProps, useDropTarget } from '../../lib/dnd'
import { setPrefs, toggleIn, usePrefs } from '../../lib/prefs'
import { cn } from '../../lib/utils'
import { IconButton } from '../ui/button'
import { noteTitle, startRename, useNoteCommands, useRenaming } from './commands'
import { InlineRename } from './InlineRename'
import { NotebookIcon, SectionTab } from './NoteIcon'
import { NoteMenu } from './NoteMenu'

export function Sidebar() {
  const { t } = useI18n()
  const cmd = useNoteCommands()
  const items = useItems()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const prefs = usePrefs()
  const tree = cmd.tree

  const activeSection = (() => {
    if (!tree) return undefined
    const m = pathname.match(/^\/(s|p)\/([^/]+)/)
    if (!m) return undefined
    return m[1] === 's' ? m[2] : sectionOf(tree, m[2]!)?.id
  })()
  const accountsActive = pathname === '/' || pathname.startsWith('/i/')
  const notebooks = tree ? childrenOf(tree, null) : []

  return (
    <nav
      aria-label={t('nav.notebooks')}
      className="flex w-[248px] shrink-0 flex-col border-r border-line bg-subtle/50"
      data-sidebar
    >
      <div className="px-2 pt-3">
        <Link
          to="/"
          className={cn(
            'flex h-8 items-center gap-2.5 rounded-md px-2 text-sm',
            accountsActive ? 'bg-active font-medium text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg',
          )}
        >
          <KeyRound className="size-4 shrink-0 text-fg-3" />
          <span className="flex-1 truncate">{t('nav.accounts')}</span>
          <span className="text-xs text-fg-3 tnum">{items?.length ?? ''}</span>
        </Link>
      </div>

      <div className="mt-4 flex h-7 items-center justify-between pr-2 pl-4">
        <span className="text-xs font-medium text-fg-3">{t('nav.notebooks')}</span>
        <IconButton label={t('nb.new')} size="xs" onClick={() => void cmd.createNotebook()}>
          <Plus />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" role="tree">
        {tree && notebooks.length === 0 && (
          <button
            type="button"
            onClick={() => void cmd.createNotebook()}
            className="mt-1 flex h-8 w-full items-center gap-2 rounded-md border border-dashed border-line-strong px-2.5 text-sm text-fg-2 hover:bg-hover hover:text-fg"
          >
            <Plus className="size-4 text-fg-3" />
            {t('nb.new')}
          </button>
        )}
        {notebooks.map((nb) => {
          const open = !prefs.closedNotebooks.includes(nb.id)
          const sections = childrenOf(tree!, nb.id).filter((s) => s.kind === 'section')
          return (
            <div key={nb.id} role="none">
              <NotebookRow note={nb} open={open} />
              {open && (
                // biome-ignore lint/a11y/useSemanticElements: ARIA tree group, not a form fieldset
                <div role="group" className="pb-1">
                  {sections.map((s) => (
                    <SectionRow key={s.id} note={s} active={s.id === activeSection} />
                  ))}
                  {sections.length === 0 && (
                    <button
                      type="button"
                      onClick={() => void cmd.createSection(nb.id)}
                      className="flex h-7 w-full items-center gap-2 rounded-md pl-9 text-sm text-fg-3 hover:bg-hover hover:text-fg-2"
                    >
                      <Plus className="size-3.5" />
                      {t('nb.newSection')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

function Row(props: {
  note: Note
  depthClass: string
  active?: boolean
  icon: ReactNode
  onActivate: () => void
  positions: Array<'before' | 'after' | 'inside'>
  trailing?: ReactNode
  ariaExpanded?: boolean
}) {
  const { note } = props
  const { t } = useI18n()
  const cmd = useNoteCommands()
  const renaming = useRenaming() === note.id
  const [menuOpen, setMenuOpen] = useState(false)
  const drop = useDropTarget({
    tree: cmd.tree,
    targetId: note.id,
    positions: props.positions,
    onDrop: (id, pos) => void cmd.move(id, note.id, pos),
  })

  return (
    <div
      role="treeitem"
      aria-selected={props.active ?? false}
      aria-expanded={props.ariaExpanded}
      tabIndex={0}
      data-note-row={note.kind}
      data-note-id={note.id}
      {...(renaming ? {} : dragSourceProps(note.id))}
      {...drop.props}
      onClick={props.onActivate}
      onDoubleClick={() => startRename(note.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuOpen(true)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          props.onActivate()
        } else if (e.key === 'F2') {
          e.preventDefault()
          startRename(note.id)
        }
      }}
      className={cn(
        'group/row relative flex h-8 cursor-default items-center gap-2 rounded-md pr-1 text-sm outline-none select-none',
        'focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]',
        props.depthClass,
        props.active ? 'bg-active font-medium text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg',
        drop.over === 'inside' && 'bg-accent-soft text-fg ring-1 ring-accent ring-inset',
      )}
    >
      {drop.over === 'before' && <DropLine className="top-0" />}
      {drop.over === 'after' && <DropLine className="bottom-0" />}
      {props.icon}
      {renaming ? (
        <InlineRename
          value={note.title}
          placeholder={noteTitle({ ...note, title: '' }, t)}
          onDone={(v) => {
            startRename(null)
            if (v !== null && v !== note.title) cmd.rename(note.id, v)
          }}
        />
      ) : (
        <span className={cn('min-w-0 flex-1 truncate', !note.title && 'text-fg-3')}>{noteTitle(note, t)}</span>
      )}
      {!renaming && props.trailing}
      {!renaming && <NoteMenu note={note} open={menuOpen} onOpenChange={setMenuOpen} />}
    </div>
  )
}

function DropLine({ className }: { className: string }) {
  return <span className={cn('pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-accent', className)} />
}

function NotebookRow({ note, open }: { note: Note; open: boolean }) {
  const { t } = useI18n()
  const cmd = useNoteCommands()
  const toggle = () => setPrefs((p) => ({ ...p, closedNotebooks: toggleIn(p.closedNotebooks, note.id, open) }))
  return (
    <Row
      note={note}
      depthClass="pl-1"
      ariaExpanded={open}
      positions={['before', 'after', 'inside']}
      onActivate={toggle}
      icon={
        <>
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-fg-3 transition-transform duration-150', open && 'rotate-90')}
          />
          <NotebookIcon color={note.color} />
        </>
      }
      trailing={
        <IconButton
          label={t('nb.newSection')}
          tooltip={false}
          size="xs"
          className="opacity-0 group-hover/row:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            void cmd.createSection(note.id)
          }}
        >
          <Plus />
        </IconButton>
      }
    />
  )
}

function SectionRow({ note, active }: { note: Note; active: boolean }) {
  const cmd = useNoteCommands()
  return (
    <Row
      note={note}
      depthClass="pl-[30px]"
      active={active}
      positions={['before', 'after', 'inside']}
      onActivate={() => cmd.openSection(note.id)}
      icon={<SectionTab color={note.color} />}
    />
  )
}
