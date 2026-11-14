import { type Card, cardToText, createField } from '@aicialnote/core'
import { ArrowDown, ArrowUp, Check, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { cn, copyText } from '../lib/utils'
import { type Advance, type EditPart, FieldRow, InlineInput } from './FieldRow'
import { TemplateIcon } from './icons'
import { ProxyCopy } from './ProxyCopy'
import { IconButton } from './ui/button'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './ui/menu'

interface Editing {
  fieldId: string
  part: EditPart
}

/** Dropping right above the row below the dragged one, or right below the row above it, changes nothing. */
function isNoopDrop(card: Card, dragId: string, drop: { id: string; at: 'before' | 'after' }) {
  const from = card.fields.findIndex((f) => f.id === dragId)
  const target = card.fields.findIndex((f) => f.id === drop.id)
  return (drop.at === 'before' && target === from + 1) || (drop.at === 'after' && target === from - 1)
}

export function CardView(props: {
  card: Card
  index: number
  count: number
  /** Start editing the first empty field (newly added cards). */
  autoEdit?: boolean
  onChange: (recipe: (card: Card) => void) => void
  onDelete: () => void
  onMove: (delta: -1 | 1) => void
}) {
  const { card } = props
  const t = useT()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!props.autoEdit) return
    const first = card.fields.find((f) => !f.value) ?? card.fields[0]
    if (first) setEditing({ fieldId: first.id, part: 'value' })
    // Only when the card first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoEdit])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  const commit = (fieldId: string, part: EditPart, value: string, advance: Advance) => {
    props.onChange((c) => {
      const f = c.fields.find((x) => x.id === fieldId)
      if (!f) return
      if (part === 'label') f.label = value
      else f.value = value
    })
    if (!advance) return setEditing(null)
    if (part === 'label') return setEditing({ fieldId, part: 'value' })
    // Tab walks every field; Enter only hops to the next empty one, so filling
    // a new card is fast and fixing a single value just ends the edit.
    const rest = card.fields.slice(card.fields.findIndex((f) => f.id === fieldId) + 1)
    const next = advance === 'tab' ? rest[0] : rest.find((f) => !f.value.trim())
    setEditing(next ? { fieldId: next.id, part: 'value' } : null)
  }

  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; at: 'before' | 'after' } | null>(null)

  /** Moves a field so it ends up at `to` in the reordered list. Does nothing when the order wouldn't change. */
  const moveField = (fieldId: string, to: number) => {
    const from = card.fields.findIndex((f) => f.id === fieldId)
    if (from < 0 || to === from || to < 0 || to >= card.fields.length) return
    props.onChange((c) => {
      const i = c.fields.findIndex((f) => f.id === fieldId)
      if (i < 0) return
      const [f] = c.fields.splice(i, 1)
      c.fields.splice(Math.min(to, c.fields.length), 0, f!)
    })
  }

  const dropOn = (targetId: string, at: 'before' | 'after') => {
    const id = dragId
    setDragId(null)
    setDrop(null)
    if (!id || id === targetId) return
    const from = card.fields.findIndex((f) => f.id === id)
    let to = card.fields.findIndex((f) => f.id === targetId) + (at === 'after' ? 1 : 0)
    if (from < to) to -= 1
    moveField(id, to)
  }

  const addField = () => {
    const field = createField({ label: t('field.newLabel'), type: 'text', value: '' })
    props.onChange((c) => {
      c.fields.push(field)
    })
    setEditing({ fieldId: field.id, part: 'label' })
  }

  const copyCard = async () => {
    if (await copyText(cardToText(card))) setCopied(true)
  }

  return (
    <section className="group/card overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
      <header className="flex h-11 items-center gap-2.5 border-b border-line pr-2 pl-3">
        <TemplateIcon template={card.template} />
        {renaming ? (
          <div className="flex-1">
            <InlineInput
              initial={card.title}
              selectAll
              className="font-medium"
              onCommit={(v) => {
                setRenaming(false)
                if (v.trim()) props.onChange((c) => void (c.title = v.trim()))
              }}
              onCancel={() => setRenaming(false)}
            />
          </div>
        ) : (
          <h3
            className="flex-1 truncate text-sm font-semibold tracking-[-0.005em]"
            onDoubleClick={() => setRenaming(true)}
          >
            {card.title}
          </h3>
        )}
        <div className="flex items-center gap-0.5">
          <ProxyCopy card={card} />
          {copied ? (
            <span className="flex h-7 items-center gap-1 px-1.5 text-xs font-medium text-accent">
              <Check className="size-3.5" />
              {t('card.copied')}
            </span>
          ) : (
            <IconButton label={t('card.copy')} onClick={() => void copyCard()}>
              <Copy />
            </IconButton>
          )}
          <Menu>
            <MenuTrigger asChild>
              <IconButton label={t('detail.more')} tooltip={false}>
                <MoreHorizontal />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Plus />} onSelect={addField}>
                {t('card.addField')}
              </MenuItem>
              <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
                {t('card.rename')}
              </MenuItem>
              <MenuItem icon={<ArrowUp />} disabled={props.index === 0} onSelect={() => props.onMove(-1)}>
                {t('card.moveUp')}
              </MenuItem>
              <MenuItem
                icon={<ArrowDown />}
                disabled={props.index === props.count - 1}
                onSelect={() => props.onMove(1)}
              >
                {t('card.moveDown')}
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} danger onSelect={props.onDelete}>
                {t('card.delete')}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <div className="divide-y divide-line">
        {card.fields.map((field, i) => (
          <FieldRow
            key={field.id}
            field={field}
            reorder={
              card.fields.length > 1
                ? {
                    canMoveUp: i > 0,
                    canMoveDown: i < card.fields.length - 1,
                    onMove: (delta) => moveField(field.id, i + delta),
                    dragging: dragId === field.id,
                    // No line where the drop wouldn't move anything.
                    dropAt:
                      drop?.id === field.id && dragId && dragId !== field.id && !isNoopDrop(card, dragId, drop)
                        ? drop.at
                        : null,
                    onDragStart: () => setDragId(field.id),
                    onDragEnd: () => {
                      setDragId(null)
                      setDrop(null)
                    },
                    onDragOver: (at) => {
                      if (drop?.id !== field.id || drop.at !== at) setDrop({ id: field.id, at })
                    },
                    onDragLeave: () => setDrop((d) => (d?.id === field.id ? null : d)),
                    onDrop: (at) => dropOn(field.id, at),
                  }
                : undefined
            }
            editing={editing?.fieldId === field.id ? editing.part : null}
            onStartEdit={(part) => setEditing({ fieldId: field.id, part })}
            onCommit={(part, value, advance) => commit(field.id, part, value, advance)}
            onCancel={() => setEditing(null)}
            onChangeType={(type) =>
              props.onChange((c) => {
                const f = c.fields.find((x) => x.id === field.id)
                if (f) f.type = type
              })
            }
            onDelete={() =>
              props.onChange((c) => {
                c.fields = c.fields.filter((x) => x.id !== field.id)
              })
            }
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addField}
        className={cn(
          'flex h-9 w-full items-center gap-2 border-line px-3 text-sm text-fg-3 hover:bg-subtle hover:text-fg-2',
          card.fields.length > 0 && 'border-t',
        )}
      >
        <Plus className="size-3.5" />
        {t('card.addField')}
      </button>
    </section>
  )
}
