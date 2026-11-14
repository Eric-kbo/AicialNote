import { FIELD_TYPES, type Field, type FieldType, parseDate, parseTotp, type TotpCode, totp } from '@aicialnote/core'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  MoreHorizontal,
  Pencil,
  SquareArrowOutUpRight,
  Trash2,
  Type,
} from 'lucide-react'
import { type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { type MessageKey, useI18n } from '../i18n'
import { cn, copyText, groupCode, isMac } from '../lib/utils'
import { IconButton } from './ui/button'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from './ui/menu'

export type EditPart = 'label' | 'value'
export type Advance = 'tab' | 'enter' | null

export interface FieldRowProps {
  field: Field
  editing: EditPart | null
  onStartEdit: (part: EditPart) => void
  /** How the edit ended: Tab moves to the next field, Enter to the next empty one. */
  onCommit: (part: EditPart, value: string, advance: Advance) => void
  onCancel: () => void
  onChangeType: (type: FieldType) => void
  onDelete: () => void
  /** Moves the field one place within its card; omitted when the card has a single field. */
  reorder?: FieldReorder
}

export interface FieldReorder {
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (delta: -1 | 1) => void
  /** This row is being dragged. */
  dragging: boolean
  /** Where a dragged row would land relative to this one. */
  dropAt: 'before' | 'after' | null
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (at: 'before' | 'after') => void
  onDragLeave: () => void
  onDrop: (at: 'before' | 'after') => void
}

const MONO_TYPES = new Set<FieldType>(['password', 'totp'])
const DRAG_MIME = 'application/x-aicialnote-field'
const moveKeyHint = (arrow: string) => `${isMac ? '⌥' : 'Alt+'}${arrow}`

const dropSide = (e: DragEvent): 'before' | 'after' => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
}

export function FieldRow(props: FieldRowProps) {
  const { field, editing, reorder } = props
  const { t } = useI18n()
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const code = useTotp(field.type === 'totp' ? field.value : '')
  const empty = !field.value.trim()
  const mono = MONO_TYPES.has(field.type) || field.role === 'host'
  const rowRef = useRef<HTMLDivElement>(null)

  // Alt+↑ / Alt+↓ on a focused row moves the field. Focus stays on the same element, which React keeps by key.
  const onRowKeyDown = (e: KeyboardEvent) => {
    if (!reorder || editing !== null || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const delta = e.key === 'ArrowUp' ? -1 : 1
    if (delta === -1 ? reorder.canMoveUp : reorder.canMoveDown) reorder.onMove(delta)
  }

  const dropProps = reorder && {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      reorder.onDragOver(dropSide(e))
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) reorder.onDragLeave()
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return
      e.preventDefault()
      reorder.onDrop(dropSide(e))
    },
  }

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    const text = field.type === 'totp' ? (code?.code ?? '') : field.value
    if (text && (await copyText(text))) setCopied(true)
  }

  const onValueClick = () => {
    if (empty || (field.type === 'totp' && !code)) props.onStartEdit('value')
    else void copy()
  }

  return (
    <div
      ref={rowRef}
      data-field-row
      onKeyDown={onRowKeyDown}
      {...dropProps}
      className={cn(
        'group/row relative grid min-h-10 grid-cols-[112px_minmax(0,1fr)_auto] items-start gap-x-3 px-3 sm:grid-cols-[136px_minmax(0,1fr)_auto]',
        copied && 'animate-flash',
        reorder?.dragging && 'opacity-40',
      )}
    >
      {reorder?.dropAt && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-accent',
            reorder.dropAt === 'before' ? '-top-px' : '-bottom-px',
          )}
        />
      )}
      {/* label */}
      <div className="flex min-w-0 py-[10px]">
        {editing === 'label' ? (
          <InlineInput
            initial={field.label}
            selectAll
            placeholder={t('field.labelPlaceholder')}
            onCommit={(v, adv) => props.onCommit('label', v.trim() || field.label, adv)}
            onCancel={props.onCancel}
            className="text-sm"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => props.onStartEdit('label')}
            className="max-w-full truncate text-left text-sm text-fg-3"
            title={field.label}
          >
            {field.label}
          </button>
        )}
      </div>

      {/* value */}
      <div className="min-w-0 py-[10px]">
        {editing === 'value' ? (
          <InlineInput
            initial={field.value}
            multiline={field.type === 'multiline'}
            mono={mono}
            placeholder={placeholderFor(field.type)}
            onCommit={(v, adv) => props.onCommit('value', field.type === 'totp' ? v.trim() : v, adv)}
            onCancel={props.onCancel}
          />
        ) : (
          <button
            type="button"
            onClick={onValueClick}
            onDoubleClick={(e) => {
              e.preventDefault()
              props.onStartEdit('value')
            }}
            title={empty ? undefined : t('field.clickToCopy')}
            className={cn(
              '-mx-1.5 -my-0.5 block max-w-[calc(100%+12px)] rounded px-1.5 py-0.5 text-left text-sm break-all',
              empty ? 'cursor-text text-fg-3/70' : 'cursor-copy hover:bg-hover',
              mono && !empty && 'font-mono text-[13px]',
              field.type === 'multiline' && 'whitespace-pre-wrap break-words',
            )}
          >
            <Value field={field} revealed={revealed} code={code} />
          </button>
        )}
      </div>

      {/* actions */}
      <div className="flex min-h-10 items-center gap-0.5">
        {copied ? (
          <span className="flex h-7 items-center gap-1 px-1.5 text-xs font-medium text-accent">
            <Check className="size-3.5" />
            {t('field.copied')}
          </span>
        ) : (
          editing === null && (
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-state=open]]:opacity-100">
              {(field.type === 'password' || field.type === 'totp') && !empty && (
                <IconButton
                  size="xs"
                  label={revealed ? t('field.hide') : t('field.reveal')}
                  onClick={() => setRevealed((r) => !r)}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </IconButton>
              )}
              {field.type === 'url' && !empty && (
                <IconButton size="xs" label={t('field.open')} onClick={() => openUrl(field.value)}>
                  <SquareArrowOutUpRight />
                </IconButton>
              )}
              <IconButton size="xs" label={t('field.edit')} onClick={() => props.onStartEdit('value')}>
                <Pencil />
              </IconButton>
              <FieldMenu
                field={field}
                onChangeType={props.onChangeType}
                onRename={() => props.onStartEdit('label')}
                onDelete={props.onDelete}
                reorder={reorder}
              />
              {reorder && (
                // Only a pointer can drag; the menu and Alt+arrows cover the keyboard.
                <span
                  data-field-handle
                  draggable
                  title={t('field.dragToReorder')}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, field.id)
                    e.dataTransfer.effectAllowed = 'move'
                    if (rowRef.current) {
                      const row = rowRef.current.getBoundingClientRect()
                      e.dataTransfer.setDragImage(rowRef.current, e.clientX - row.left, e.clientY - row.top)
                    }
                    reorder.onDragStart()
                  }}
                  onDragEnd={reorder.onDragEnd}
                  className="flex h-7 w-5 cursor-grab items-center justify-center rounded-md text-fg-3 hover:bg-hover hover:text-fg-2 active:cursor-grabbing [&_svg]:size-3.5"
                >
                  <GripVertical />
                </span>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function Value({ field, revealed, code }: { field: Field; revealed: boolean; code: TotpCode | null }) {
  const { t } = useI18n()
  if (!field.value.trim()) return <>{t('field.empty')}</>
  switch (field.type) {
    case 'password':
      return <>{revealed ? field.value : '••••••••••'}</>
    case 'totp':
      if (!code) return <span className="font-sans text-st-red">{t('field.totpInvalid')}</span>
      return (
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[15px] font-medium tracking-[0.04em] text-fg tnum">{groupCode(code.code)}</span>
          <Countdown remaining={code.remaining} period={code.period} />
          {revealed && <span className="w-full text-xs break-all text-fg-3">{field.value}</span>}
        </span>
      )
    case 'date':
      return (
        <span className="flex flex-wrap items-center gap-2">
          <span className="tnum">{field.value}</span>
          {field.role === 'expires' && <ExpiryBadge value={field.value} />}
        </span>
      )
    case 'url':
      return <span className="text-accent">{field.value}</span>
    default:
      return <>{field.value}</>
  }
}

export function ExpiryBadge({ value }: { value: string }) {
  const { t } = useI18n()
  const date = parseDate(value)
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  if (days > 14) return null
  const tone = days < 0 ? 'red' : days <= 7 ? 'yellow' : 'gray'
  const label =
    days < 0 ? t('field.expired', { n: -days }) : days === 0 ? t('field.today') : t('field.daysLeft', { n: days })
  return (
    <span
      className="inline-flex h-5 items-center rounded px-1.5 font-sans text-2xs font-medium"
      style={{
        color: `var(--st-${tone})`,
        background: `color-mix(in oklab, var(--st-${tone}) 12%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}

function Countdown({ remaining, period }: { remaining: number; period: number }) {
  const r = 6
  const c = 2 * Math.PI * r
  const urgent = remaining <= 5
  return (
    <span className={cn('inline-flex items-center gap-1 font-sans text-xs tnum', urgent ? 'text-st-red' : 'text-fg-3')}>
      <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden="true">
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - remaining / period)}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      {remaining}s
    </span>
  )
}

function FieldMenu(props: {
  field: Field
  onChangeType: (t: FieldType) => void
  onRename: () => void
  onDelete: () => void
  reorder?: FieldReorder
}) {
  const { t } = useI18n()
  const { reorder } = props
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton size="xs" label={t('detail.more')} tooltip={false}>
          <MoreHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<Pencil />} onSelect={props.onRename}>
          {t('card.rename')}
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger icon={<Type />}>{t('field.type')}</MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup value={props.field.type} onValueChange={(v) => props.onChangeType(v as FieldType)}>
              {FIELD_TYPES.map((type) => (
                <MenuRadioItem key={type} value={type}>
                  {t(`type.${type}` as MessageKey)}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        {reorder && (
          <>
            <MenuSeparator />
            <MenuItem
              icon={<ArrowUp />}
              shortcut={moveKeyHint('↑')}
              disabled={!reorder.canMoveUp}
              onSelect={() => reorder.onMove(-1)}
            >
              {t('card.moveUp')}
            </MenuItem>
            <MenuItem
              icon={<ArrowDown />}
              shortcut={moveKeyHint('↓')}
              disabled={!reorder.canMoveDown}
              onSelect={() => reorder.onMove(1)}
            >
              {t('card.moveDown')}
            </MenuItem>
          </>
        )}
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} danger onSelect={props.onDelete}>
          {t('field.delete')}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export function InlineInput(props: {
  initial: string
  onCommit: (value: string, advance: Advance) => void
  onCancel: () => void
  multiline?: boolean
  mono?: boolean
  selectAll?: boolean
  placeholder?: string
  className?: string
}) {
  const [value, setValue] = useState(props.initial)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    if (props.selectAll) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
    // Focus once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!props.multiline || !ref.current) return
    const el = ref.current
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, props.multiline])

  const commit = (advance: Advance) => {
    if (done.current) return
    done.current = true
    props.onCommit(value, advance)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      done.current = true
      props.onCancel()
    } else if (e.key === 'Enter' && (!props.multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      commit(props.multiline ? null : 'enter')
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      commit('tab')
    }
  }

  const cls = cn(
    'w-full rounded bg-surface px-1.5 py-0.5 -mx-1.5 -my-0.5 text-sm outline-none ring-1 ring-accent shadow-[0_0_0_3px_var(--ring)]',
    props.mono && 'font-mono text-[13px]',
    props.className,
  )
  const common = {
    ref,
    value,
    placeholder: props.placeholder,
    spellCheck: false,
    autoComplete: 'off',
    onChange: (e: { target: { value: string } }) => setValue(e.target.value),
    onKeyDown,
    onBlur: () => commit(null),
    className: cls,
  }
  return props.multiline ? (
    <textarea
      {...common}
      rows={2}
      className={cn(cls, 'block resize-none leading-[22px]')}
      style={{ width: 'calc(100% + 12px)' }}
    />
  ) : (
    <input {...common} style={{ width: 'calc(100% + 12px)' }} />
  )
}

function useTotp(secret: string): TotpCode | null {
  const [code, setCode] = useState<TotpCode | null>(null)
  useEffect(() => {
    if (!secret.trim()) {
      setCode(null)
      return
    }
    const config = parseTotp(secret)
    if (!config) {
      setCode(null)
      return
    }
    let alive = true
    const tick = () =>
      void totp(config).then((c) => {
        if (alive) setCode(c)
      })
    tick()
    const timer = setInterval(tick, 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [secret])
  return code
}

function placeholderFor(type: FieldType): string | undefined {
  if (type === 'date') return 'YYYY-MM-DD'
  if (type === 'url') return 'https://'
  if (type === 'totp') return 'JBSW Y3DP EHPK 3PXP…'
  return undefined
}

function openUrl(value: string) {
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
