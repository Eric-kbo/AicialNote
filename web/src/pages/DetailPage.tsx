import {
  ancestors,
  type Card,
  createCard,
  type Item,
  itemToText,
  pick,
  TEMPLATES,
  type VaultMeta,
} from '@aicialnote/core'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CardView } from '../components/CardView'
import { StatusDot, TemplateIcon } from '../components/icons'
import { noteTitle } from '../components/notes/commands'
import { Button, IconButton } from '../components/ui/button'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '../components/ui/menu'
import { toast } from '../components/ui/toast'
import { consumeNameFocus, useUI } from '../components/ui-state'
import { useItem, useItems, useMeta, useNoteTree, useVault } from '../data/vault'
import { useI18n } from '../i18n'
import { useHotkey } from '../lib/hotkeys'
import { absoluteTime, cn, copyText, modKey, relativeTime } from '../lib/utils'

export function DetailPage() {
  const { id } = useParams({ from: '/i/$id' })
  const item = useItem(id)
  const meta = useMeta()
  const { t } = useI18n()

  if (item === undefined || !meta) return null
  if (item === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 pb-24 text-sm text-fg-2">
        {t('detail.notFound')}
        <Link to="/" className="text-accent hover:underline">
          {t('detail.back')}
        </Link>
      </div>
    )
  }
  return <Detail key={item.id} item={item} meta={meta} />
}

/**
 * One account. Standalone at /i/$id (with back / previous / next), or
 * `embedded` as the right-hand column of a notebook, where the page list
 * already does navigation.
 */
export function Detail({
  item,
  meta,
  embedded,
  onDeleted,
}: {
  item: Item
  meta: VaultMeta
  embedded?: boolean
  onDeleted?: () => void
}) {
  const { t, locale } = useI18n()
  const { actions } = useVault()
  const { visibleIds, openPaste } = useUI()
  const allItems = useItems()
  const navigate = useNavigate()
  const tree = useNoteTree()
  const location = tree?.byId.has(item.id) ? [...ancestors(tree, item.id)] : []
  const [autoEditCard, setAutoEditCard] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const update = (recipe: (d: Item) => void) => void actions.updateItem(item.id, recipe)
  const updateCard = (cardId: string, recipe: (c: Card) => void) =>
    update((d) => {
      const c = d.cards.find((x) => x.id === cardId)
      if (c) recipe(c)
    })

  // prev / next in list order (falls back to all items when the list wasn't opened)
  const order = visibleIds.length
    ? visibleIds
    : (allItems ?? [])
        .map((i) => i.id)
        .sort()
        .reverse()
  const pos = order.indexOf(item.id)
  const go = (delta: number) => {
    const next = order[pos + delta]
    if (next) void navigate({ to: '/i/$id', params: { id: next } })
  }

  useHotkey('escape', () => void navigate({ to: '/' }), !embedded)
  useHotkey(['k', 'arrowup'], () => go(-1), !embedded)
  useHotkey(['j', 'arrowdown'], () => go(1), !embedded)

  useEffect(() => {
    if (!copiedAll) return
    const timer = setTimeout(() => setCopiedAll(false), 1400)
    return () => clearTimeout(timer)
  }, [copiedAll])

  const addCard = (templateId: string) => {
    const card = createCard(templateId, locale)
    update((d) => {
      d.cards.push(card)
    })
    setAutoEditCard(card.id)
  }

  const removeCard = (card: Card, index: number) => {
    update((d) => {
      d.cards = d.cards.filter((c) => c.id !== card.id)
    })
    toast(t('card.deleted', { name: card.title }), {
      action: {
        label: t('common.undo'),
        onClick: () =>
          update((d) => {
            d.cards.splice(Math.min(index, d.cards.length), 0, card)
          }),
      },
    })
  }

  const moveCard = (index: number, delta: -1 | 1) =>
    update((d) => {
      const [c] = d.cards.splice(index, 1)
      if (c) d.cards.splice(index + delta, 0, c)
    })

  const remove = async () => {
    const deleted = await actions.deleteItem(item.id)
    if (onDeleted) onDeleted()
    else void navigate({ to: '/' })
    if (deleted)
      toast(t('detail.deleted', { id: deleted.displayId }), {
        action: { label: t('common.undo'), onClick: () => void actions.restoreItem(deleted) },
      })
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* toolbar */}
      <div className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-line bg-bg/85 px-4 backdrop-blur-md">
        {embedded ? (
          <span className="flex min-w-0 items-center gap-1 px-1 text-xs text-fg-3">
            {location.map((n) => (
              <span key={n.id} className="flex min-w-0 items-center gap-1">
                <span className="max-w-[160px] truncate">{noteTitle(n, t)}</span>
                <span className="text-line-strong">/</span>
              </span>
            ))}
            <span className="font-mono text-fg-2">{item.displayId}</span>
          </span>
        ) : (
          <>
            <Link
              to="/"
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-fg-2 hover:bg-hover hover:text-fg"
            >
              <ArrowLeft className="size-4" />
              {t('detail.back')}
            </Link>
            <span className="text-fg-3">/</span>
            <span className="px-1.5 font-mono text-xs text-fg-2">{item.displayId}</span>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {!embedded && (
            <>
              {pos !== -1 && order.length > 1 && (
                <span className="mr-1 text-xs text-fg-3 tnum">
                  {pos + 1} / {order.length}
                </span>
              )}
              <IconButton label={t('detail.prev')} shortcut="K" disabled={pos <= 0} onClick={() => go(-1)}>
                <ChevronUp />
              </IconButton>
              <IconButton
                label={t('detail.next')}
                shortcut="J"
                disabled={pos === -1 || pos >= order.length - 1}
                onClick={() => go(1)}
              >
                <ChevronDown />
              </IconButton>
              <span className="mx-1 h-4 w-px bg-line" />
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (await copyText(itemToText(item))) setCopiedAll(true)
            }}
          >
            {copiedAll ? <Check className="text-accent" /> : <Copy />}
            {copiedAll ? t('field.copied') : t('detail.copyAll')}
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label={t('detail.more')} tooltip={false}>
                <MoreHorizontal />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                icon={<ClipboardPaste />}
                shortcut={`${modKey}+V`}
                onSelect={() => openPaste({ targetItemId: item.id })}
              >
                {t('detail.paste')}
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} danger onSelect={() => void remove()}>
                {t('detail.delete')}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <article className="mx-auto w-full max-w-[760px] px-6 pt-8 pb-24">
        {/* title */}
        <NameInput item={item} onCommit={(name) => update((d) => void (d.name = name))} />

        {/* meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusMenu meta={meta} value={item.status} onChange={(s) => update((d) => void (d.status = s))} />
          <Tags
            tags={item.tags}
            suggestions={[...new Set((allItems ?? []).flatMap((i) => i.tags))]}
            onChange={(tags) => update((d) => void (d.tags = tags))}
          />
        </div>

        {/* cards */}
        <div className="mt-8 flex flex-col gap-4">
          {item.cards.map((card, i) => (
            <CardView
              key={card.id}
              card={card}
              index={i}
              count={item.cards.length}
              autoEdit={autoEditCard === card.id}
              onChange={(recipe) => updateCard(card.id, recipe)}
              onDelete={() => removeCard(card, i)}
              onMove={(delta) => moveCard(i, delta)}
            />
          ))}

          {item.cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong p-5">
              <p className="mb-3 text-sm text-fg-2">{t('detail.emptyCards')}</p>
              <div data-card-templates className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => addCard(tpl.id)}
                    className="flex h-10 items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 text-sm hover:border-line-strong hover:bg-hover"
                  >
                    <TemplateIcon template={tpl.id} />
                    <span className="truncate">{pick(tpl.name, locale)}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => openPaste({ targetItemId: item.id })}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg"
              >
                <ClipboardPaste className="size-3.5" />
                {t('detail.paste')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-fg-2">
                    <Plus />
                    {t('detail.addCard')}
                  </Button>
                </MenuTrigger>
                <MenuContent align="start">
                  {TEMPLATES.map((tpl) => (
                    <MenuItem
                      key={tpl.id}
                      icon={<TemplateIcon template={tpl.id} size="sm" />}
                      onSelect={() => addCard(tpl.id)}
                    >
                      {pick(tpl.name, locale)}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <Button
                variant="ghost"
                size="sm"
                className="text-fg-2"
                onClick={() => openPaste({ targetItemId: item.id })}
              >
                <ClipboardPaste />
                {t('detail.paste')}
              </Button>
            </div>
          )}
        </div>

        {/* notes */}
        <section className="mt-10">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-fg-3 uppercase">{t('detail.notes')}</h2>
          <Notes value={item.notes} onCommit={(notes) => update((d) => void (d.notes = notes))} />
        </section>

        <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-fg-3">
          <span title={absoluteTime(item.createdAt)}>
            {t('detail.created', { time: absoluteTime(item.createdAt) })}
          </span>
          <span title={absoluteTime(item.updatedAt)}>
            {t('detail.updated', { time: relativeTime(item.updatedAt, t) })}
          </span>
          {!embedded && location.length > 0 && (
            <Link to="/p/$pageId" params={{ pageId: item.id }} className="hover:text-fg hover:underline">
              {t('detail.location')}
              {location.map((n) => noteTitle(n, t)).join(' / ')}
            </Link>
          )}
          <span className="ml-auto font-mono">{item.id}</span>
        </footer>
      </article>
    </div>
  )
}

function NameInput({ item, onCommit }: { item: Item; onCommit: (name: string) => void }) {
  const { t } = useI18n()
  const [value, setValue] = useState(item.name)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => setValue(item.name), [item.name])
  useEffect(() => {
    if (consumeNameFocus(item.id)) ref.current?.focus()
  }, [item.id])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() !== item.name && onCommit(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setValue(item.name)
          e.currentTarget.blur()
          e.stopPropagation()
        }
      }}
      data-item-name
      placeholder={t('detail.namePlaceholder')}
      className="-mx-1 w-[calc(100%+8px)] rounded-md bg-transparent px-1 text-[26px] leading-[36px] font-semibold tracking-[-0.02em] outline-none placeholder:text-fg-3/60 hover:bg-hover/60 focus:bg-transparent"
    />
  )
}

function StatusMenu(props: { meta: VaultMeta; value: string; onChange: (s: string) => void }) {
  const current = props.meta.statuses.find((s) => s.id === props.value)
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-2 rounded-md border border-line bg-surface pr-1.5 pl-2.5 text-sm hover:border-line-strong data-[state=open]:border-line-strong"
        >
          {current && <StatusDot color={current.color} />}
          {current?.label ?? props.value}
          <ChevronDown className="size-3.5 text-fg-3" />
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuRadioGroup value={props.value} onValueChange={props.onChange}>
          {props.meta.statuses.map((s) => (
            <MenuRadioItem key={s.id} value={s.id} icon={<StatusDot color={s.color} className="mx-1" />}>
              {s.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

function Tags(props: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')

  const commit = () => {
    const tag = value.trim()
    if (tag && !props.tags.includes(tag)) props.onChange([...props.tags, tag])
    setValue('')
  }

  return (
    <>
      {props.tags.map((tag) => (
        <span
          key={tag}
          className="group inline-flex h-7 items-center gap-1 rounded-md bg-subtle pr-1 pl-2 text-sm text-fg-2 ring-1 ring-line ring-inset"
        >
          {tag}
          <button
            type="button"
            aria-label={`× ${tag}`}
            onClick={() => props.onChange(props.tags.filter((x) => x !== tag))}
            className="inline-flex size-5 items-center justify-center rounded text-fg-3 opacity-60 hover:bg-hover hover:text-fg group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <>
          <input
            // Shown only after the user clicks "+ Tag", so taking focus is expected.
            ref={(el) => el?.focus()}
            list="aicialnote-tags"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setValue('')
                setAdding(false)
              } else if (e.key === 'Backspace' && !value && props.tags.length) {
                props.onChange(props.tags.slice(0, -1))
              }
            }}
            onBlur={() => {
              commit()
              setAdding(false)
            }}
            className="h-7 w-28 rounded-md border border-accent bg-surface px-2 text-sm shadow-[0_0_0_3px_var(--ring)] outline-none"
          />
          <datalist id="aicialnote-tags">
            {props.suggestions
              .filter((s) => !props.tags.includes(s))
              .map((s) => (
                <option key={s} value={s} />
              ))}
          </datalist>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-line-strong px-2 text-sm text-fg-3',
            'hover:border-fg-3 hover:text-fg-2',
          )}
        >
          <Plus className="size-3.5" />
          {t('detail.addTag')}
        </button>
      )}
    </>
  )
}

function Notes({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const { t } = useI18n()
  const [text, setText] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(88, el.scrollHeight)}px`
  }, [text])

  // Save while typing too, so a crash or closed tab never loses a paragraph.
  useEffect(() => {
    if (text === value) return
    const timer = setTimeout(() => onCommit(text), 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return (
    <textarea
      ref={ref}
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false
        if (text !== value) onCommit(text)
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          e.currentTarget.blur()
        }
      }}
      placeholder={t('detail.notesPlaceholder')}
      className="block w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-[22px] outline-none transition-colors hover:border-line-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--ring)]"
    />
  )
}
