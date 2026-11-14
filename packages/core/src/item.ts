import { formatDisplayId, ulid } from './ids'
import type { Field, Item } from './schema'
import { FORMAT_VERSION, ITEM_FORMAT } from './schema'

export function createItem(input: { seq: number; name?: string; status?: string; now?: Date }): Item {
  const now = (input.now ?? new Date()).toISOString()
  return {
    format: ITEM_FORMAT,
    formatVersion: FORMAT_VERSION,
    id: ulid(),
    displayId: formatDisplayId(input.seq),
    name: input.name ?? '',
    status: input.status ?? 'active',
    tags: [],
    cards: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

function* allFields(item: Item): Generator<Field> {
  for (const card of item.cards) yield* card.fields
}

/** The value shown in the list's "main account" column. */
export function primaryValue(item: Item): string {
  let firstEmail = ''
  let firstText = ''
  for (const field of allFields(item)) {
    const v = field.value.trim()
    if (!v) continue
    if (field.role === 'account') return v
    if (!firstEmail && field.type === 'email') firstEmail = v
    if (!firstText && (field.type === 'text' || field.type === 'url')) firstText = v
  }
  return firstEmail || firstText
}

const SECRET_TYPES = new Set(['password', 'totp'])

/** Lower-cased haystack for search. Secrets are excluded on purpose. */
export function searchText(item: Item): string {
  const parts = [item.displayId, item.name, item.notes, ...item.tags]
  for (const card of item.cards) {
    parts.push(card.title)
    for (const field of card.fields) if (!SECRET_TYPES.has(field.type)) parts.push(field.value)
  }
  return parts.join('\n').toLowerCase()
}

export interface Expiry {
  cardTitle: string
  field: Field
  date: Date
  daysLeft: number
}

/** Date fields with role "expires", soonest first. */
export function expiries(item: Item, now = new Date()): Expiry[] {
  const out: Expiry[] = []
  for (const card of item.cards) {
    for (const field of card.fields) {
      if (field.type !== 'date' || field.role !== 'expires' || !field.value) continue
      const date = parseDate(field.value)
      if (!date) continue
      const daysLeft = Math.ceil((date.getTime() - startOfDay(now).getTime()) / 86_400_000)
      out.push({ cardTitle: card.title, field, date, daysLeft })
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

export function parseDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Plain-text rendering of a card, for "copy card". */
export function cardToText(card: Item['cards'][number]): string {
  return card.fields
    .filter((f) => f.value.trim())
    .map((f) => `${f.label}: ${f.value}`)
    .join('\n')
}

export function itemToText(item: Item): string {
  const head = [item.name || item.displayId]
  const cards = item.cards.map((c) => `[${c.title}]\n${cardToText(c)}`).filter((s) => s.includes(':'))
  return [...head, ...cards, ...(item.notes.trim() ? [item.notes.trim()] : [])].join('\n\n')
}
