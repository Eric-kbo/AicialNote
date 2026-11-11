import {
  ancestors,
  childrenOf,
  expiries,
  getTemplate,
  type Item,
  type Note,
  pick,
  primaryValue,
  searchText,
  type VaultMeta,
} from '@aicialnote/core'
import { useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ClipboardPaste, Clock, Copy, Plus, Search, SearchX, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { StatusDot, TemplateIcon } from '../components/icons'
import { consumeTitleFocus, noteTitle, useNoteCommands } from '../components/notes/commands'
import { Button, IconButton } from '../components/ui/button'
import { Kbd } from '../components/ui/kbd'
import { Menu, MenuCheckItem, MenuContent, MenuLabel, MenuTrigger } from '../components/ui/menu'
import { emptyFilters, type Filters, hasFilters, requestNameFocus, useUI } from '../components/ui-state'
import { useMeta, useNoteTree, useSortedItems, useVault } from '../data/vault'
import { useI18n } from '../i18n'
import { useHotkey } from '../lib/hotkeys'
import { cn, copyText, modKey, relativeTime } from '../lib/utils'

const ROW = 40
const GRID = 'grid grid-cols-[84px_minmax(140px,1.1fr)_minmax(180px,1.5fr)_104px_116px_88px] items-center gap-x-4'
const GRID_WITH_LOCATION =
  'grid grid-cols-[84px_minmax(140px,1.1fr)_minmax(180px,1.4fr)_minmax(120px,1fr)_104px_116px_88px] items-center gap-x-4'

/** Editable title of an account list, shown where the global list says "All". */
function ListTitle({ list }: { list: Note }) {
  const { t } = useI18n()
  const cmd = useNoteCommands()
  const [value, setValue] = useState(list.title)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setValue(list.title), [list.title])
  useEffect(() => {
    if (consumeTitleFocus(list.id)) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [list.id])
  const commit = () => value.trim() !== list.title && cmd.rename(list.id, value.trim())
  return (
    <input
      ref={ref}
      data-page-title
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setValue(list.title)
          e.currentTarget.blur()
        }
      }}
      placeholder={t('nb.listTitlePlaceholder')}
      className="-mx-1 min-w-[4ch] max-w-[60%] rounded-md bg-transparent px-1 text-lg [field-sizing:content] font-semibold tracking-[-0.01em] outline-none placeholder:text-fg-3/60 hover:bg-hover/60 focus:bg-transparent focus:shadow-[0_0_0_2px_var(--ring)]"
    />
  )
}

const haystacks = new WeakMap<Item, string>()
function hay(item: Item) {
  let h = haystacks.get(item)
  if (h === undefined) {
    h = searchText(item)
    haystacks.set(item, h)
  }
  return h
}

function isExpiring(item: Item) {
  return expiries(item).some((e) => e.daysLeft <= 7)
}

export function applyFilters(items: Item[], f: Filters): Item[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter((item) => {
    if (f.statuses.length && !f.statuses.includes(item.status)) return false
    if (f.tags.length && !f.tags.every((t) => item.tags.includes(t))) return false
    if (f.templates.length && !f.templates.every((t) => item.cards.some((c) => c.template === t))) return false
    if (f.expiring && !isExpiring(item)) return false
    if (words.length) {
      const h = hay(item)
      if (!words.every((w) => h.includes(w))) return false
    }
    return true
  })
}

/**
 * The account table. At "/" it lists every account (with a Location column).
 * With `scope` it is the right-hand column of an account list in a notebook
 * and shows only that list's accounts, in the list's order.
 */
export function ListPage({ scope }: { scope?: Note } = {}) {
  const { t } = useI18n()
  const allSorted = useSortedItems()
  const meta = useMeta()
  const ui = useUI()
  const { setVisibleIds, openPaste } = ui
  const [localFilters, setLocalFilters] = useState<Filters>(emptyFilters)
  const filters = scope ? localFilters : ui.filters
  const setFilters = scope ? setLocalFilters : ui.setFilters
  const { actions } = useVault()
  const tree = useNoteTree()
  const cmd = useNoteCommands()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [cursor, setCursor] = useState(-1)

  const items = useMemo(() => {
    if (!scope) return allSorted
    if (!tree) return undefined
    return childrenOf(tree, scope.id).flatMap((n) => tree.items.get(n.id) ?? [])
  }, [scope, allSorted, tree])

  const visible = useMemo(() => (items ? applyFilters(items, filters) : []), [items, filters])

  useEffect(() => {
    if (!scope) setVisibleIds(visible.map((i) => i.id))
  }, [scope, visible, setVisibleIds])

  /** "Notebook / Section / List" for the Location column. */
  const locationOf = (item: Item) => {
    if (!tree?.byId.has(item.id)) return ''
    return ancestors(tree, item.id)
      .map((n) => noteTitle(n, t))
      .join(' / ')
  }

  useEffect(() => {
    setCursor((c) => Math.min(c, visible.length - 1))
  }, [visible.length])

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 12,
  })

  const open = (item: Item) =>
    scope
      ? void navigate({ to: '/p/$pageId', params: { pageId: item.id } })
      : void navigate({ to: '/i/$id', params: { id: item.id } })
  const createBlank = async () => {
    if (scope) return cmd.createAccount(scope.id)
    const [item] = await actions.createItems([() => {}])
    requestNameFocus(item!.id)
    open(item!)
  }
  const paste = () => openPaste(scope ? { targetListId: scope.id } : {})

  const move = (delta: number) => {
    if (!visible.length) return
    const next = Math.max(0, Math.min(visible.length - 1, cursor + delta))
    setCursor(next)
    virtualizer.scrollToIndex(next, { align: 'auto' })
  }

  useHotkey('/', () => searchRef.current?.focus())
  useHotkey(['j', 'arrowdown'], () => move(1))
  useHotkey(['k', 'arrowup'], () => move(-1))
  useHotkey('enter', () => {
    const item = visible[cursor]
    if (item) open(item)
  })
  useHotkey('n', () => void createBlank())

  if (!items || !meta) return null

  if (items.length === 0)
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {scope && (
          <div className="px-6 pt-5">
            <ListTitle list={scope} />
          </div>
        )}
        <EmptyState onPaste={paste} onBlank={() => void createBlank()} />
      </div>
    )

  const filtered = hasFilters(filters)
  const grid = scope ? GRID : GRID_WITH_LOCATION

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col" data-account-list={scope?.id}>
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-3">
        {scope ? (
          <ListTitle list={scope} />
        ) : (
          <h1 className="text-lg font-semibold tracking-[-0.01em]">{t('nav.all')}</h1>
        )}
        <span className="shrink-0 text-sm text-fg-3 tnum">
          {filtered
            ? t('list.filtered', { n: visible.length, total: items.length })
            : t('list.count', { n: items.length })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={paste}>
            <ClipboardPaste />
            {t('list.paste')}
          </Button>
          <Button variant="primary" onClick={() => void createBlank()}>
            <Plus />
            {t('list.new')}
            <Kbd tone="inverse">N</Kbd>
          </Button>
        </div>
      </div>

      {/* filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-3">
        <div className="relative w-full max-w-[320px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" />
          <input
            ref={searchRef}
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilters((f) => ({ ...f, q: '' }))
                e.currentTarget.blur()
              } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
                if (e.key === 'Enter' && visible[0]) open(visible[0])
                else move(1)
              }
            }}
            placeholder={t('nav.searchPlaceholder')}
            className="h-8 w-full rounded-md border border-line bg-surface pr-8 pl-8 text-sm outline-none transition-colors hover:border-line-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--ring)]"
          />
          {filters.q ? (
            <button
              type="button"
              aria-label={t('list.filter.clear')}
              onClick={() => setFilters((f) => ({ ...f, q: '' }))}
              className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-fg-3 hover:bg-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
              <Kbd>/</Kbd>
            </span>
          )}
        </div>
        <FilterMenus items={items} meta={meta} filters={filters} setFilters={setFilters} />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
            {t('list.filter.clear')}
          </Button>
        )}
      </div>

      {/* table */}
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className={cn('flex h-full flex-col', scope ? 'min-w-[720px]' : 'min-w-[980px]')}>
          <div className={cn(grid, 'h-8 shrink-0 border-y border-line px-6 text-xs text-fg-3')}>
            <span>{t('list.col.id')}</span>
            <span>{t('list.col.name')}</span>
            <span>{t('list.col.primary')}</span>
            {!scope && <span>{t('list.col.location')}</span>}
            <span>{t('list.col.cards')}</span>
            <span>{t('list.col.status')}</span>
            <span className="text-right">{t('list.col.updated')}</span>
          </div>
          {visible.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 pb-24 text-center">
              <SearchX className="mb-2 size-5 text-fg-3" />
              <p className="text-sm font-medium">{t('list.noMatch')}</p>
              <p className="text-sm text-fg-3">{t('list.noMatchHint')}</p>
            </div>
          ) : (
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="relative" style={{ height: virtualizer.getTotalSize() + 24 }}>
                {virtualizer.getVirtualItems().map((row) => {
                  const item = visible[row.index]!
                  return (
                    <Row
                      key={item.id}
                      item={item}
                      meta={meta}
                      grid={grid}
                      location={scope ? undefined : locationOf(item)}
                      selected={row.index === cursor}
                      top={row.start}
                      onOpen={() => open(item)}
                      onHover={() => setCursor(row.index)}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row(props: {
  item: Item
  meta: VaultMeta
  grid: string
  /** Global list only: "Notebook / Section / List", or '' when unfiled. */
  location?: string
  selected: boolean
  top: number
  onOpen: () => void
  onHover: () => void
}) {
  const { item, meta } = props
  const { t } = useI18n()
  const status = meta.statuses.find((s) => s.id === item.status)
  const primary = primaryValue(item)
  const expiry = expiries(item)[0]
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    // biome-ignore lint/a11y/useSemanticElements: virtualized grid row
    <div
      role="row"
      tabIndex={-1}
      onClick={props.onOpen}
      onMouseMove={props.selected ? undefined : props.onHover}
      className={cn(
        props.grid,
        'group absolute inset-x-0 h-10 cursor-default border-b border-line/70 px-6 text-sm',
        props.selected && 'bg-hover',
      )}
      style={{ transform: `translateY(${props.top}px)` }}
    >
      <span className="font-mono text-xs text-fg-3">{item.displayId}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn('truncate font-medium', !item.name && 'text-fg-3')}>{item.name || t('list.untitled')}</span>
        {item.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="hidden shrink-0 rounded bg-subtle px-1.5 text-2xs leading-[18px] text-fg-2 ring-1 ring-line ring-inset lg:inline"
          >
            {tag}
          </span>
        ))}
        {item.tags.length > 2 && <span className="hidden text-2xs text-fg-3 lg:inline">+{item.tags.length - 2}</span>}
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate text-fg-2">{primary || '—'}</span>
        {primary &&
          (copied ? (
            <span className="shrink-0 text-xs font-medium text-accent">{t('field.copied')}</span>
          ) : (
            <IconButton
              size="xs"
              label={t('field.copy')}
              className="opacity-0 group-hover:opacity-100"
              onClick={async (e) => {
                e.stopPropagation()
                if (await copyText(primary)) setCopied(true)
              }}
            >
              <Copy />
            </IconButton>
          ))}
      </span>
      {props.location !== undefined && (
        <span className={cn('truncate text-xs', props.location ? 'text-fg-2' : 'text-fg-3')} title={props.location}>
          {props.location || t('list.unfiled')}
        </span>
      )}
      <span className="flex items-center gap-1">
        {item.cards.slice(0, 4).map((c) => (
          <TemplateIcon key={c.id} template={c.template} size="sm" />
        ))}
        {item.cards.length > 4 && <span className="text-2xs text-fg-3">+{item.cards.length - 4}</span>}
        {expiry && expiry.daysLeft <= 7 && (
          <Clock
            className="ml-0.5 size-3.5"
            style={{ color: expiry.daysLeft < 0 ? 'var(--st-red)' : 'var(--st-yellow)' }}
            aria-label={
              expiry.daysLeft < 0
                ? t('field.expired', { n: -expiry.daysLeft })
                : t('field.daysLeft', { n: expiry.daysLeft })
            }
          />
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {status && <StatusDot color={status.color} />}
        <span className="truncate text-fg-2">{status?.label ?? item.status}</span>
      </span>
      <span className="text-right text-xs text-fg-3 tnum">{relativeTime(item.updatedAt, t)}</span>
    </div>
  )
}

function FilterMenus({
  items,
  meta,
  filters,
  setFilters,
}: {
  items: Item[]
  meta: VaultMeta
  filters: Filters
  setFilters: (f: Filters | ((f: Filters) => Filters)) => void
}) {
  const { t, locale } = useI18n()

  const counts = useMemo(() => {
    const status = new Map<string, number>()
    const template = new Map<string, number>()
    const tag = new Map<string, number>()
    let expiring = 0
    for (const item of items) {
      status.set(item.status, (status.get(item.status) ?? 0) + 1)
      for (const id of new Set(item.cards.map((c) => c.template ?? 'custom')))
        template.set(id, (template.get(id) ?? 0) + 1)
      for (const tg of item.tags) tag.set(tg, (tag.get(tg) ?? 0) + 1)
      if (isExpiring(item)) expiring++
    }
    return { status, template, tag, expiring }
  }, [items])

  const toggle = (key: 'statuses' | 'templates' | 'tags', value: string) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }))

  return (
    <>
      <FilterButton label={t('list.filter.status')} active={filters.statuses.length}>
        {meta.statuses.map((s) => (
          <MenuCheckItem
            key={s.id}
            checked={filters.statuses.includes(s.id)}
            onSelect={() => toggle('statuses', s.id)}
            icon={<StatusDot color={s.color} className="mx-1" />}
          >
            <Count label={s.label} n={counts.status.get(s.id)} />
          </MenuCheckItem>
        ))}
      </FilterButton>

      <FilterButton label={t('list.filter.cards')} active={filters.templates.length}>
        {[...counts.template.keys()].length === 0 && <MenuLabel>{t('list.filter.none')}</MenuLabel>}
        {[...counts.template.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => {
            const tpl = getTemplate(id)
            return (
              <MenuCheckItem
                key={id}
                checked={filters.templates.includes(id)}
                onSelect={() => toggle('templates', id)}
                icon={<TemplateIcon template={id} size="sm" />}
              >
                <Count label={tpl ? pick(tpl.name, locale) : id} n={n} />
              </MenuCheckItem>
            )
          })}
      </FilterButton>

      <FilterButton label={t('list.filter.tags')} active={filters.tags.length}>
        {counts.tag.size === 0 && <MenuLabel>{t('list.filter.none')}</MenuLabel>}
        {[...counts.tag.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([tag, n]) => (
            <MenuCheckItem key={tag} checked={filters.tags.includes(tag)} onSelect={() => toggle('tags', tag)}>
              <Count label={tag} n={n} />
            </MenuCheckItem>
          ))}
      </FilterButton>

      {counts.expiring > 0 && (
        <button
          type="button"
          aria-pressed={filters.expiring}
          onClick={() => setFilters((f) => ({ ...f, expiring: !f.expiring }))}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
            filters.expiring
              ? 'border-[color-mix(in_oklab,var(--st-yellow)_45%,transparent)] bg-[color-mix(in_oklab,var(--st-yellow)_10%,transparent)] text-fg'
              : 'border-dashed border-line-strong text-fg-2 hover:bg-hover',
          )}
        >
          <Clock className="size-3.5 text-st-yellow" />
          {t('list.filter.expiring')}
          <span className="text-xs text-fg-3 tnum">{counts.expiring}</span>
        </button>
      )}
    </>
  )
}

function FilterButton(props: { label: string; active: number; children: ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border pr-2 pl-2.5 text-sm transition-colors data-[state=open]:bg-hover',
            props.active
              ? 'border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-accent-soft text-fg'
              : 'border-dashed border-line-strong text-fg-2 hover:bg-hover',
          )}
        >
          {props.label}
          {props.active > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-accent px-1 text-2xs font-semibold text-accent-fg tnum">
              {props.active}
            </span>
          )}
          <ChevronDown className="size-3.5 text-fg-3" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="max-h-[360px] overflow-y-auto">
        {props.children}
      </MenuContent>
    </Menu>
  )
}

function Count({ label, n }: { label: string; n?: number }) {
  return (
    <span className="flex w-full items-center justify-between gap-4">
      <span className="truncate">{label}</span>
      <span className="text-xs text-fg-3 tnum">{n ?? 0}</span>
    </span>
  )
}

function EmptyState({ onPaste, onBlank }: { onPaste: () => void; onBlank: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex h-full items-start justify-center px-6 pt-[14vh]">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex -space-x-1.5">
          {['google', 'apple', 'proxy', 'microsoft'].map((id) => (
            <span key={id} className="rounded-[7px] bg-bg p-[2px]">
              <TemplateIcon template={id} size="lg" />
            </span>
          ))}
        </div>
        <h1 className="text-xl font-semibold tracking-[-0.015em]">{t('list.empty.title')}</h1>
        <p className="mt-2 text-sm leading-[22px] text-fg-2">{t('list.empty.body')}</p>
        <div className="mt-6 flex items-center gap-2">
          <Button variant="primary" onClick={onPaste}>
            <ClipboardPaste />
            {t('list.empty.paste')}
            <Kbd tone="inverse">{`${modKey}+V`}</Kbd>
          </Button>
          <Button variant="ghost" onClick={onBlank}>
            {t('list.empty.blank')}
          </Button>
        </div>
      </div>
    </div>
  )
}
