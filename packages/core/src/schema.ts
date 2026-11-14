import { z } from 'zod'

/**
 * On-drive data format. See docs/data-format.md.
 *
 * Rules that keep the format durable:
 * - Every file is self-describing (`format` + `formatVersion`).
 * - Every value is a plain string, every field carries its own label, so a
 *   JSON file still makes sense without the app or its templates.
 * - Unknown keys are preserved (objects are "loose"), so older app versions
 *   never strip data written by newer ones.
 */

export const ITEM_FORMAT = 'aicialnote.item'
export const VAULT_FORMAT = 'aicialnote.vault'
export const FORMAT_VERSION = 1

/**
 * The app was called OnlyNote until 2026-11-09, and files written before the
 * rename say `onlynote.<kind>`. Both spellings are read, and the current one is
 * written on the next save, so no existing file becomes unreadable.
 */
export function formatTag<T extends string>(tag: T, legacy: string) {
  return z.union([z.literal(tag), z.literal(legacy)]).transform((): T => tag)
}

export const FIELD_TYPES = ['text', 'password', 'totp', 'email', 'phone', 'url', 'date', 'multiline'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

/** Semantic meaning of a field, used for smart paste and list summaries. */
export const FIELD_ROLES = [
  'account',
  'username',
  'password',
  'totp',
  'recovery',
  'phone',
  'host',
  'region',
  'expires',
  'url',
  'name',
  'birthday',
  'address',
] as const
export type FieldRole = (typeof FIELD_ROLES)[number]

const iso = z.string().min(1)

export const fieldSchema = z.looseObject({
  id: z.string().min(1),
  label: z.string(),
  type: z.enum(FIELD_TYPES).catch('text'),
  value: z.string(),
  role: z.enum(FIELD_ROLES).optional().catch(undefined),
})
export type Field = z.infer<typeof fieldSchema>

export const cardSchema = z.looseObject({
  id: z.string().min(1),
  /** Template the card was created from. Informational only. */
  template: z.string().optional(),
  title: z.string(),
  fields: z.array(fieldSchema),
})
export type Card = z.infer<typeof cardSchema>

export const itemSchema = z.looseObject({
  format: formatTag(ITEM_FORMAT, 'onlynote.item'),
  formatVersion: z.number().int().min(1),
  id: z.string().min(1),
  displayId: z.string().min(1),
  name: z.string(),
  status: z.string(),
  tags: z.array(z.string()),
  cards: z.array(cardSchema),
  notes: z.string(),
  /**
   * Where the item sits in the notebooks: a section or an account list
   * (notes/<parentId>.json) and a fractional order key. Absent = not filed.
   */
  location: z
    .looseObject({ parentId: z.string().min(1), order: z.string().min(1) })
    .optional()
    .catch(undefined),
  createdAt: iso,
  updatedAt: iso,
})
export type Item = z.infer<typeof itemSchema>

export const STATUS_COLORS = ['green', 'blue', 'yellow', 'red', 'gray'] as const
export type StatusColor = (typeof STATUS_COLORS)[number]

export const statusSchema = z.looseObject({
  id: z.string().min(1),
  label: z.string(),
  color: z.enum(STATUS_COLORS).catch('gray'),
})
export type Status = z.infer<typeof statusSchema>

export const vaultMetaSchema = z.looseObject({
  format: formatTag(VAULT_FORMAT, 'onlynote.vault'),
  formatVersion: z.number().int().min(1),
  createdAt: iso,
  /** Any BCP 47 tag. Kept as written, so a language this version has no translations for survives a round trip. */
  locale: z.string().min(1).catch('zh'),
  /** Next number for human-friendly display ids (ID-0001, ID-0002 …). */
  nextSeq: z.number().int().min(1),
  statuses: z.array(statusSchema),
})
export type VaultMeta = z.infer<typeof vaultMetaSchema>

export class FormatError extends Error {
  constructor(
    message: string,
    readonly raw?: string,
  ) {
    super(message)
    this.name = 'FormatError'
  }
}

/** Data written by a newer app version. Never overwrite it. */
export class UnsupportedVersionError extends FormatError {
  constructor(readonly version: number) {
    super(
      `Data format version ${version} is newer than this app supports (${FORMAT_VERSION}). Please update AicialNote.`,
    )
    this.name = 'UnsupportedVersionError'
  }
}

export function parseWith<T>(schema: z.ZodType<T>, text: string, what: string): T {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new FormatError(`${what} is not valid JSON`, text)
  }
  const version = (raw as { formatVersion?: unknown })?.formatVersion
  if (typeof version === 'number' && version > FORMAT_VERSION) throw new UnsupportedVersionError(version)
  const result = schema.safeParse(raw)
  if (!result.success) throw new FormatError(`${what} is invalid: ${z.prettifyError(result.error)}`, text)
  return result.data
}

export function parseItem(text: string): Item {
  return parseWith(itemSchema, text, 'Item')
}

export function parseVaultMeta(text: string): VaultMeta {
  return parseWith(vaultMetaSchema, text, 'vault.json')
}

export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
