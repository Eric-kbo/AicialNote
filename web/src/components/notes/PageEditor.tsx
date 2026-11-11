import { ancestors, emptyDoc, type Note, type NoteDoc } from '@aicialnote/core'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  ChevronDown,
  Code,
  Highlighter,
  Italic,
  Link2,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react'
import { Popover } from 'radix-ui'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useNoteTree, useVault } from '../../data/vault'
import { useI18n } from '../../i18n'
import { cn, isMac, modKey } from '../../lib/utils'
import { IconButton } from '../ui/button'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/menu'
import { BLOCKS, type BlockType } from './blocks'
import { consumeTitleFocus, noteTitle } from './commands'

const SAVE_DELAY = 400

/** Right-hand column: title, date and the rich text body of one page. */
export default function PageEditor({ page }: { page: Note }) {
  const { t, locale } = useI18n()
  const { actions } = useVault()
  const tree = useNoteTree()

  // --- saving: local db on every pause; the sync engine batches the pushes --
  const pending = useRef<NoteDoc | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastSaved = useRef(JSON.stringify(page.content ?? null))
  const flush = () => {
    clearTimeout(timer.current)
    const doc = pending.current
    if (!doc) return
    pending.current = null
    lastSaved.current = JSON.stringify(doc)
    void actions.updateNote(
      page.id,
      (d) => {
        d.content = doc
      },
      { typing: true },
    )
  }
  const flushRef = useRef(flush)
  flushRef.current = flush

  const slash = useSlashMenu()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
        a11y: { checkboxLabel: (node) => t('editor.taskCheckbox', { text: node.textContent || t('editor.task') }) },
      }),
      TableKit.configure({ table: { resizable: false } }),
      Highlight,
      Placeholder.configure({ placeholder: t('editor.placeholder') }),
    ],
    content: page.content ?? emptyDoc(),
    editorProps: {
      attributes: { class: 'note-content', 'data-page-editor': '', spellcheck: 'false' },
      handleKeyDown: (_view, event) => slash.onKeyDownRef.current(event),
      // Ctrl+click opens links; a plain click places the cursor for editing.
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement).closest('a')
        if (a && (isMac ? event.metaKey : event.ctrlKey)) {
          window.open(a.href, '_blank', 'noopener,noreferrer')
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      pending.current = editor.getJSON() as NoteDoc
      clearTimeout(timer.current)
      timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY)
      slash.update(editor)
    },
    onSelectionUpdate: ({ editor }) => slash.update(editor),
    onBlur: () => {
      flushRef.current()
      slash.close()
    },
  })

  // Save before the tab hides or the page changes.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flushRef.current()
    const onUnload = () => flushRef.current()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
      flushRef.current()
    }
  }, [])

  // Content pulled from another device. Local edits in flight win.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const incoming = JSON.stringify(page.content ?? null)
    if (incoming === lastSaved.current || pending.current) return
    lastSaved.current = incoming
    if (JSON.stringify(editor.getJSON()) === incoming) return
    editor.commands.setContent(page.content ?? emptyDoc(), { emitUpdate: false })
  }, [editor, page.content])

  const crumbs = tree ? ancestors(tree, page.id) : []
  const created = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'full', timeStyle: 'short' }).format(
        new Date(page.createdAt),
      ),
    [locale, page.createdAt],
  )

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <Toolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto" data-page-scroll>
        <article className="mx-auto w-full max-w-[780px] px-10 pt-8 pb-[30vh]">
          <div className="mb-2 flex min-h-5 flex-wrap items-center gap-1 text-xs text-fg-3">
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-line-strong">/</span>}
                <span className="max-w-[200px] truncate">{noteTitle(c, t)}</span>
              </span>
            ))}
          </div>
          <TitleInput
            page={page}
            onEnter={() => {
              if (!editor) return
              // Tiptap's focus() waits a frame; move DOM focus now so the next keystroke can't land in the title.
              editor.view.dom.focus()
              editor.commands.focus('start')
            }}
          />
          <div className="mt-2 mb-6 flex items-center gap-3 text-xs text-fg-3">
            <span>{created}</span>
            <CharCount editor={editor} />
          </div>
          <EditorContent editor={editor} />
        </article>
      </div>
      {editor && slash.state && <SlashMenu editor={editor} slash={slash} />}
    </div>
  )
}

// --- title ---------------------------------------------------------------------

function TitleInput({ page, onEnter }: { page: Note; onEnter: () => void }) {
  const { t } = useI18n()
  const { actions } = useVault()
  const [value, setValue] = useState(page.title)
  const focused = useRef(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused.current) setValue(page.title)
  }, [page.title])
  useEffect(() => {
    if (consumeTitleFocus(page.id)) ref.current?.focus()
  }, [page.id])

  // Save while typing so the page list follows along.
  useEffect(() => {
    if (value === page.title) return
    const timer = setTimeout(
      () => void actions.updateNote(page.id, (d) => void (d.title = value), { typing: true }),
      300,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Leaving the page within the debounce window (no blur fires on unmount) must not drop the title.
  const latest = useRef({ value, saved: page.title })
  latest.current = { value, saved: page.title }
  useEffect(
    () => () => {
      const { value: v, saved } = latest.current
      if (v !== saved) void actions.updateNote(page.id, (d) => void (d.title = v))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <input
      ref={ref}
      data-page-title
      value={value}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        focused.current = false
        if (value !== page.title) void actions.updateNote(page.id, (d) => void (d.title = value))
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault()
          onEnter()
        }
        if (e.key === 'Escape') e.currentTarget.blur()
      }}
      placeholder={t('editor.titlePlaceholder')}
      className="w-full border-b border-line bg-transparent pb-2 text-[28px] leading-[38px] font-semibold tracking-[-0.02em] outline-none placeholder:text-fg-3/60 focus:border-accent"
    />
  )
}

function CharCount({ editor }: { editor: Editor | null }) {
  const { t } = useI18n()
  const n = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? e.state.doc.textContent.replace(/\s/g, '').length : 0),
  })
  if (!n) return null
  return <span className="tnum">{t('editor.chars', { n })}</span>
}

// --- toolbar -------------------------------------------------------------------

function Toolbar({ editor }: { editor: Editor | null }) {
  const { t } = useI18n()
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null
      return {
        block: BLOCKS.find((b) => b.isActive?.(e) && b.id !== 'paragraph')?.id ?? 'paragraph',
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        code: e.isActive('code'),
        highlight: e.isActive('highlight'),
        link: e.isActive('link'),
        table: e.isActive('table'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      }
    },
  })
  if (!editor || !s) return <div className="h-11 shrink-0 border-b border-line" />

  const chain = () => editor.chain().focus()
  const current = BLOCKS.find((b) => b.id === s.block) ?? BLOCKS[0]!
  const mod = modKey === '⌘' ? '⌘' : 'Ctrl+'

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-3"
    >
      <Tool label={t('editor.undo')} shortcut={`${mod}Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 />
      </Tool>
      <Tool
        label={t('editor.redo')}
        shortcut={`${mod}${isMac ? '⇧Z' : 'Y'}`}
        disabled={!s.canRedo}
        onClick={() => chain().redo().run()}
      >
        <Redo2 />
      </Tool>
      <Divider />
      <Menu modal={false}>
        <MenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 w-[104px] shrink-0 items-center justify-between gap-1 rounded-md px-2 text-sm text-fg-2 hover:bg-hover hover:text-fg data-[state=open]:bg-hover"
          >
            <span className="truncate">{t(current.label)}</span>
            <ChevronDown className="size-3.5 shrink-0 text-fg-3" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          {BLOCKS.filter((b) => b.id !== 'table' && b.id !== 'divider').map((b) => (
            <MenuItem key={b.id} icon={b.icon} onSelect={() => b.run(editor)}>
              <span className={cn(b.id === s.block && 'font-medium text-accent')}>{t(b.label)}</span>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Divider />
      <Tool label={t('editor.bold')} shortcut={`${mod}B`} active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </Tool>
      <Tool
        label={t('editor.italic')}
        shortcut={`${mod}I`}
        active={s.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic />
      </Tool>
      <Tool
        label={t('editor.underline')}
        shortcut={`${mod}U`}
        active={s.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <Underline />
      </Tool>
      <Tool
        label={t('editor.strike')}
        shortcut={`${mod}${isMac ? '⇧S' : 'Shift+S'}`}
        active={s.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Strikethrough />
      </Tool>
      <Tool label={t('editor.highlight')} active={s.highlight} onClick={() => chain().toggleHighlight().run()}>
        <Highlighter />
      </Tool>
      <Tool label={t('editor.code')} shortcut={`${mod}E`} active={s.code} onClick={() => chain().toggleCode().run()}>
        <Code />
      </Tool>
      <LinkButton editor={editor} active={s.link} />
      <Divider />
      {BLOCKS.filter((b) => ['bullet', 'ordered', 'task', 'quote', 'code'].includes(b.id)).map((b) => (
        <Tool key={b.id} label={t(b.label)} active={s.block === b.id} onClick={() => b.run(editor)}>
          {b.icon}
        </Tool>
      ))}
      <Divider />
      {s.table ? (
        <Menu modal={false}>
          <MenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent-soft px-2 text-sm text-fg hover:bg-hover data-[state=open]:bg-hover"
            >
              <Table2 className="size-4 text-accent" />
              {t('editor.table')}
              <ChevronDown className="size-3.5 text-fg-3" />
            </button>
          </MenuTrigger>
          <MenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
            <MenuItem onSelect={() => chain().addRowAfter().run()}>{t('editor.addRowAfter')}</MenuItem>
            <MenuItem onSelect={() => chain().addColumnAfter().run()}>{t('editor.addColumnAfter')}</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => chain().deleteRow().run()}>{t('editor.deleteRow')}</MenuItem>
            <MenuItem onSelect={() => chain().deleteColumn().run()}>{t('editor.deleteColumn')}</MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => chain().deleteTable().run()}>
              {t('editor.deleteTable')}
            </MenuItem>
          </MenuContent>
        </Menu>
      ) : (
        <Tool label={t('editor.table')} onClick={() => BLOCKS.find((b) => b.id === 'table')!.run(editor)}>
          <Table2 />
        </Tool>
      )}
    </div>
  )
}

function Tool(props: {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <IconButton
      label={props.label}
      shortcut={props.shortcut}
      disabled={props.disabled}
      aria-pressed={props.active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
      className={cn(props.active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent')}
    >
      {props.children}
    </IconButton>
  )
}

function Divider() {
  return <span className="mx-1.5 h-4 w-px shrink-0 bg-line" />
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')

  const apply = () => {
    const url = href.trim()
    setOpen(false)
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!url) return void chain.unsetLink().run()
    const full = /^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}`
    if (editor.state.selection.empty && !active) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: full } }] })
        .run()
    } else chain.setLink({ href: full }).run()
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        if (o) setHref((editor.getAttributes('link').href as string | undefined) ?? '')
        setOpen(o)
      }}
    >
      <Popover.Trigger asChild>
        <IconButton
          label={t('editor.link')}
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent')}
        >
          <Link2 />
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="animate-pop z-50 flex w-[340px] items-center gap-1 rounded-lg bg-surface p-1.5 shadow-pop"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: the popover exists to type a link
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply()
              }
            }}
            placeholder={t('editor.linkPlaceholder')}
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-sm outline-none focus:border-accent"
          />
          {active && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                editor.chain().focus().extendMarkRange('link').unsetLink().run()
              }}
              className="h-8 shrink-0 rounded-md px-2 text-sm text-st-red hover:bg-hover"
            >
              {t('editor.linkRemove')}
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// --- "/" menu --------------------------------------------------------------------

interface SlashState {
  query: string
  /** Document position of the "/" character. */
  from: number
  to: number
  index: number
  left: number
  top: number
}

function useSlashMenu() {
  const [state, setState] = useState<SlashState | null>(null)
  const stateRef = useRef<SlashState | null>(null)
  stateRef.current = state
  const dismissedAt = useRef<number | null>(null)
  const itemsRef = useRef<BlockType[]>([])
  const editorRef = useRef<Editor | null>(null)

  const close = () => setState(null)

  const choose = (block: BlockType) => {
    const s = stateRef.current
    const editor = editorRef.current
    if (!s || !editor) return
    setState(null)
    editor.chain().focus().deleteRange({ from: s.from, to: s.to }).run()
    block.run(editor)
  }

  const update = (editor: Editor) => {
    editorRef.current = editor
    const { selection } = editor.state
    const { $from, empty } = selection
    if (!empty || $from.parent.type.name === 'codeBlock') return setState(null)
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
    const m = before.match(/(?:^|\s)\/([^\s/]{0,24})$/)
    if (!m) {
      dismissedAt.current = null
      return setState(null)
    }
    const from = $from.pos - m[1]!.length - 1
    if (dismissedAt.current === from) return
    const coords = editor.view.coordsAtPos($from.pos)
    setState((prev) => ({
      query: m[1]!,
      from,
      to: $from.pos,
      index: prev && prev.from === from ? prev.index : 0,
      left: Math.min(coords.left, window.innerWidth - 272),
      top: coords.bottom + 260 > window.innerHeight ? coords.top - 266 : coords.bottom + 6,
    }))
  }

  const onKeyDownRef = useRef<(e: KeyboardEvent) => boolean>(() => false)
  onKeyDownRef.current = (e) => {
    const s = stateRef.current
    if (!s) return false
    const items = itemsRef.current
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return true
      const d = e.key === 'ArrowDown' ? 1 : -1
      setState({ ...s, index: (s.index + d + items.length) % items.length })
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const item = items[s.index]
      if (!item) return false
      choose(item)
      return true
    }
    if (e.key === 'Escape') {
      dismissedAt.current = s.from
      setState(null)
      return true
    }
    return false
  }

  return { state, setState, close, choose, update, onKeyDownRef, itemsRef }
}

function SlashMenu({ editor, slash }: { editor: Editor; slash: ReturnType<typeof useSlashMenu> }) {
  const { t } = useI18n()
  const s = slash.state!
  const q = s.query.toLowerCase()
  const items = BLOCKS.filter((b) => !q || t(b.label).toLowerCase().includes(q) || b.keywords.includes(q))
  slash.itemsRef.current = items
  const index = Math.min(s.index, items.length - 1)

  useEffect(() => {
    document.querySelector('[data-slash-item][aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <div
      role="listbox"
      data-slash-menu
      className="animate-pop fixed z-50 max-h-[260px] w-[260px] overflow-y-auto rounded-lg bg-surface p-1 text-sm shadow-pop"
      style={{ left: s.left, top: s.top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.length === 0 && <div className="px-2 py-2 text-fg-3">{t('editor.slashEmpty')}</div>}
      {items.map((b, i) => (
        <div
          key={b.id}
          role="option"
          tabIndex={-1}
          data-slash-item
          aria-selected={i === index}
          onMouseEnter={() => slash.setState({ ...s, index: i })}
          onClick={() => {
            slash.choose(b)
            editor.commands.focus()
          }}
          onKeyDown={() => {}}
          className={cn(
            'flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 [&>svg]:size-4 [&>svg]:text-fg-3',
            i === index && 'bg-hover',
          )}
        >
          {b.icon}
          <span>{t(b.label)}</span>
        </div>
      ))}
    </div>
  )
}
