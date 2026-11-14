import { LOCALES, type Localized, pick } from './i18n'
import { DRIVE_TRANSLATIONS } from './locales'
import type { Card, FieldRole, FieldType } from './schema'
import { CUSTOM_TEMPLATE_ID, createCard, createField, ROLE_DEFAULTS, TEMPLATES } from './templates'
import { isTotpSecret } from './totp'

/**
 * Smart paste: turns whatever a message / a colleague / an old note gave you
 * into structured values.
 *
 * Supported shapes:
 *   1. Labelled text   "账号 a@gmail.com 密码 xyz 辅助邮箱 b@x.com 温馨提示 …"
 *   2. Delimited line  "a@gmail.com----xyz----b@x.com----JBSWY3DPEHPK3PXP"
 *   3. Bulk            many delimited lines → one entry per line
 *   4. Loose tokens    "a@gmail.com xyz"
 *   5. One field per line, "Label: value", which is also what "copy card" produces.
 *      The whole rest of the line is the value, and labels without a role still become fields.
 */

export interface ParsedValue {
  /** Absent for a labelled value that has no known role ("带宽: 10 Mbps"). It becomes a field of its own. */
  role?: FieldRole
  value: string
  /** The label the value was pasted with, on "Label: value" lines. */
  label?: string
  type?: FieldType
}

export interface ParsedEntry {
  values: ParsedValue[]
  /** Text that couldn't be assigned to a field. Goes to notes. */
  rest: string
  /** Item name, when the text says it (the first line of "copy all"). */
  name?: string
}

export interface PasteResult {
  mode: 'single' | 'bulk'
  entries: ParsedEntry[]
}

// --- value classifiers -------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const URL_RE = /^https?:\/\/\S+$/i
const IPV4 = String.raw`(?:\d{1,3}\.){3}\d{1,3}`
const HOST_PORT = new RegExp(String.raw`^(?:${IPV4}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d{2,5})?$`, 'i')
const PROXY_COMBO = new RegExp(String.raw`^(${IPV4}|[a-z0-9-]+(?:\.[a-z0-9-]+)+):(\d{2,5}):([^:\s]+):(\S+)$`, 'i')
// The scheme (socks5://, http://) is captured so the address keeps it.
const PROXY_AT = new RegExp(String.raw`^(?:(\w+):\/\/)?([^:\s@]+):([^\s@]+)@(${IPV4}|[a-z0-9.-]+):(\d{2,5})$`, 'i')
const DATE = /^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?$/
const DATE_TIME = /^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/
// A time following a labelled date: "过期时间 2026-12-12 20:29:04".
const TIME_AFTER = /^[ \tT]+(\d{1,2}:\d{2}(?::\d{2})?)(?![\d:])/
const CJK = /[　-〿㐀-鿿＀-￯]/

function isPhone(v: string) {
  if (!/^\+?[\d\s\-().]{7,22}$/.test(v)) return false
  const digits = v.replace(/\D/g, '').length
  return digits >= 7 && digits <= 15
}

/** Upper- or lower-case base32 of at least 16 chars, optionally grouped by spaces. */
function looksLikeTotp(v: string) {
  if (/^otpauth:\/\//i.test(v)) return true
  const compact = v.replace(/\s/g, '')
  if (compact.length < 16) return false
  if (!/^[A-Z2-7]+$/.test(compact) && !/^[a-z2-7]+$/.test(compact)) return false
  return isTotpSecret(compact)
}

type Kind = 'email' | 'url' | 'totp' | 'proxy' | 'host' | 'phone' | 'date' | 'plain'

function classify(v: string): Kind {
  if (PROXY_COMBO.test(v) || PROXY_AT.test(v)) return 'proxy'
  if (EMAIL.test(v)) return 'email'
  if (URL_RE.test(v)) return 'url'
  if (DATE.test(v)) return 'date'
  if (HOST_PORT.test(v) && /\d/.test(v) && (v.includes(':') || new RegExp(`^${IPV4}$`).test(v))) return 'host'
  if (looksLikeTotp(v)) return 'totp'
  if (isPhone(v)) return 'phone'
  return 'plain'
}

/** Assigns roles to unlabelled values based on their shape and order. */
function assignByShape(tokens: string[]): ParsedEntry {
  const values: ParsedValue[] = []
  const rest: string[] = []
  const has = (role: FieldRole) => values.some((v) => v.role === role)
  const add = (role: FieldRole, value: string) => values.push({ role, value })

  for (const token of tokens) {
    const v = token.trim()
    if (!v) continue
    switch (classify(v)) {
      case 'email':
        if (!has('account')) add('account', v)
        else if (!has('recovery')) add('recovery', v)
        else rest.push(v)
        break
      case 'url':
        has('url') ? rest.push(v) : add('url', v)
        break
      case 'totp':
        has('totp') ? rest.push(v) : add('totp', v.replace(/\s/g, ''))
        break
      case 'proxy': {
        const combo = v.match(PROXY_COMBO)
        if (combo) {
          add('host', `${combo[1]}:${combo[2]}`)
          add('username', combo[3]!)
          add('password', combo[4]!)
        } else {
          const at = v.match(PROXY_AT)!
          add('host', `${at[1] ? `${at[1].toLowerCase()}://` : ''}${at[4]}:${at[5]}`)
          add('username', at[2]!)
          add('password', at[3]!)
        }
        break
      }
      case 'host':
        has('host') ? rest.push(v) : add('host', v)
        break
      case 'date':
        has('expires') ? rest.push(v) : add('expires', v)
        break
      case 'phone': {
        // A bare number right after a login is more likely a password.
        const slot = plainSlot(has)
        if (!v.startsWith('+') && slot && slot !== 'account') add(slot, v)
        else if (!has('phone')) add('phone', v)
        else rest.push(v)
        break
      }
      default: {
        const slot = CJK.test(v) ? null : plainSlot(has)
        slot ? add(slot, v) : rest.push(v)
      }
    }
  }
  return { values, rest: rest.join(' ') }
}

/**
 * Where an unremarkable token goes, given what we have so far:
 *   proxy:   host → username → password
 *   account: account → password
 */
function plainSlot(has: (role: FieldRole) => boolean): FieldRole | null {
  if (has('host')) {
    if (!has('username')) return 'username'
    if (!has('password')) return 'password'
    return null
  }
  if (!has('account')) return 'account'
  if (!has('password')) return 'password'
  return null
}

// --- labelled text -----------------------------------------------------------

const LABELS: Array<[FieldRole, string[]]> = [
  ['recovery', ['辅助邮箱', '辅邮', '备用邮箱', '恢复邮箱', '救援邮箱', 'recovery email', 'recovery', 'backup email']],
  [
    'totp',
    ['2fa密钥', '2fa', '二步验证', '两步验证', '二次验证', '验证器密钥', '谷歌验证器', 'totp', 'secret', '密钥'],
  ],
  ['password', ['密码', 'password', 'passwd', 'pwd', 'pass']],
  [
    'account',
    [
      '账号',
      '帐号',
      '账户',
      '帐户',
      '邮箱地址',
      '邮箱',
      'apple id',
      'email address',
      'email',
      'e-mail',
      'account',
      'login',
      'mail',
    ],
  ],
  ['username', ['用户名', 'username', 'user']],
  ['phone', ['手机号码', '手机号', '手机', '电话', 'phone', 'mobile', 'tel']],
  ['host', ['代理地址', '代理', 'proxy', 'ip地址', 'ip', 'host', '服务器地址', '服务器', '主机', '地址']],
  ['region', ['地区', '国家', 'region', 'country']],
  ['expires', ['过期时间', '到期时间', '到期', '有效期至', 'expires', 'expiry', 'expire']],
  ['url', ['网址', '链接', 'url', 'website', 'site']],
]

const ALIAS_TO_ROLE = new Map<string, FieldRole>()
for (const [role, aliases] of LABELS) for (const a of aliases) ALIAS_TO_ROLE.set(a, role)

const ALIASES = [...ALIAS_TO_ROLE.keys()].sort((a, b) => b.length - a.length)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// ASCII labels must stand alone ("user" must not match "user1"); CJK labels
// are usually glued to their neighbours ("密码123").
const aliasPattern = (a: string) =>
  /^[\x20-\x7e]+$/.test(a) ? `(?<![A-Za-z0-9])${escapeRe(a)}(?![A-Za-z0-9])` : escapeRe(a)
const LABEL_RE = new RegExp(String.raw`(${ALIASES.map(aliasPattern).join('|')})\s*[:：=]?\s*([^\s,，;；、。|]+)?`, 'gi')

/** Values a role must not look like (filters "修改密码" style false positives). */
function acceptable(role: FieldRole, value: string): boolean {
  if (CJK.test(value) && role !== 'region' && role !== 'expires') return false
  if (role === 'recovery') return EMAIL.test(value)
  // "地址" is also a postal address; only a host-shaped value is a proxy or server address.
  if (role === 'host') return /[.:]/.test(value) && !/\s/.test(value)
  if (role === 'totp') return looksLikeTotp(value) || /^[A-Za-z2-7]{16,}$/.test(value)
  return true
}

function parseLabelled(text: string): ParsedEntry | null {
  const values: ParsedValue[] = []
  const consumed: Array<[number, number]> = []
  for (const m of text.matchAll(LABEL_RE)) {
    const alias = m[1]!.toLowerCase()
    const value = m[2]
    const role = ALIAS_TO_ROLE.get(alias)
    if (!role || !value || ALIAS_TO_ROLE.has(value.toLowerCase())) continue
    if (values.some((v) => v.role === role) || !acceptable(role, value)) continue
    // "一个地区IP使用约7天": a label glued to running text is just a word.
    const gap = m[0].slice(m[1]!.length, m[0].length - value.length)
    if (CJK.test(value) && !/[\s:：=]/.test(gap)) continue
    let end = m.index + m[0].length
    let full = value
    // "到期 2026-12-12 20:29:04": the time after the date belongs to it.
    const time = role === 'expires' && DATE.test(value) ? text.slice(end).match(TIME_AFTER) : null
    if (time) {
      full = `${value} ${time[1]}`
      end += time[0].length
    }
    values.push({ role, value: full })
    consumed.push([m.index, end])
  }
  if (values.length === 0) return null

  let rest = ''
  let cursor = 0
  for (const [start, end] of consumed) {
    rest += `${text.slice(cursor, start)} `
    cursor = end
  }
  rest += text.slice(cursor)
  return { values, rest: tidy(rest) }
}

function tidy(s: string) {
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s,，;；、。|-]+|[\s,，;；、|-]+$/g, '')
}

// --- key-value text ----------------------------------------------------------

/** Label spelling for lookups: "recoveryEmail", "recovery_email" and "Recovery  email" are the same key. */
const norm = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

interface LabelMeaning {
  role?: FieldRole
  type: FieldType
}

/**
 * Every label a card can carry, in every language AicialNote writes, plus the paste aliases. A copied card
 * ("地址: 1.2.3.4:9004", "API Key: sk-…") therefore comes back with the same roles and types.
 */
const KNOWN_LABELS = new Map<string, LabelMeaning[]>()
/** Template id → the spellings of its field labels, for guessing which template a copied card came from. */
const TEMPLATE_LABELS = new Map<string, Set<string>>()

function indexLabels() {
  const tags = [...LOCALES, ...Object.keys(DRIVE_TRANSLATIONS)]
  const spellings = (l: Localized) => new Set(tags.map((t) => norm(pick(l, t))))
  const learn = (label: string, meaning: LabelMeaning) => {
    const list = KNOWN_LABELS.get(label) ?? []
    if (!list.some((m) => m.role === meaning.role && m.type === meaning.type)) list.push(meaning)
    KNOWN_LABELS.set(label, list)
  }
  for (const t of TEMPLATES) {
    const own = new Set<string>()
    for (const f of t.fields) {
      for (const s of spellings(f.label)) {
        own.add(s)
        learn(s, { role: f.role, type: f.type })
      }
    }
    TEMPLATE_LABELS.set(t.id, own)
  }
  for (const [role, d] of Object.entries(ROLE_DEFAULTS) as Array<[FieldRole, (typeof ROLE_DEFAULTS)[FieldRole]]>) {
    for (const s of spellings(d.label)) learn(s, { role, type: d.type })
  }
  for (const [alias, role] of ALIAS_TO_ROLE) learn(alias, { role, type: ROLE_DEFAULTS[role].type })
}
indexLabels()

/**
 * Whether a value fits a role when its label is explicit. Looser than `acceptable`: "用户名: 张三" is meant,
 * but "地址: 北京市…" is a postal address, not a proxy.
 */
function fitsRole(role: FieldRole, value: string): boolean {
  if (role === 'host') return !CJK.test(value) && !/\s/.test(value)
  if (role === 'recovery') return EMAIL.test(value)
  if (role === 'totp') return looksLikeTotp(value) || /^[A-Za-z2-7\s]{16,}$/.test(value)
  return true
}

function meaningFor(label: string, value: string, taken: Set<FieldRole>): LabelMeaning {
  const known = KNOWN_LABELS.get(norm(label)) ?? []
  const fits = known.filter((m) => !m.role || fitsRole(m.role, value))
  const meaning = fits.find((m) => m.role && !taken.has(m.role)) ?? fits.find((m) => !m.role)
  // A second value for a role already filled, or one that doesn't fit: keep it as a field under its label.
  return meaning ?? { type: fits[0]?.type ?? shapeType(value) }
}

function shapeType(value: string): FieldType {
  if (EMAIL.test(value)) return 'email'
  if (URL_RE.test(value)) return 'url'
  if (DATE_TIME.test(value)) return 'date'
  return 'text'
}

/** One "key → value" found in a line. */
interface Pair {
  label: string
  value: string
  /** Lookup key for the label's meaning; the last segment of a JSON path ("proxy.host" → "host"). */
  key: string
  known: boolean
  /** Only whitespace between key and value ("c c1"). */
  spaced: boolean
  /** The separator clearly marks a key ("Key: v", "key=v", "键：v", "【键】v"), unlike a bare "user:pass". */
  strong: boolean
}

// The first separator in a line ends the key. " - " and " | " need spaces around them, so "e-mail" stays one word.
const SEPARATOR = /(\s*)(：|＝|=>|->|→|=|\t|\s\|\s|\s[-–—]\s|:)(\s*)/
const STRONG_SEPARATORS = new Set(['：', '＝', '=>', '->', '→', '='])
const BRACKETED = /^[【[]([^】\]]{1,24})[】\]]\s*[:：]?\s*(.+)$/
const SECTION = /^(?:\[[^\]]+\]|【[^】]+】)$/
// Two labelled values on one line ("账号: a@b.com 密码: x") are labelled text, not one pair.
const INLINE_LABEL_RE = new RegExp(String.raw`(?:^|\s)(?:${ALIASES.map(escapeRe).join('|')})\s*[:：]`, 'i')

/** List bullets, Markdown bold and shell `export` around a key. */
function cleanLine(line: string) {
  return line
    .replace(/^(?:[-*+•·]\s+|\d{1,2}(?:[.)]\s+|、\s*))/, '')
    .replace(/^export\s+(?=\w+=)/, '')
    .replace(/^\*\*([^*]+)\*\*/, '$1')
    .trim()
}

/** `"value",` → `value` (JSON-ish and .env lines). */
function unquote(s: string) {
  const t = s.trim().replace(/,$/, '').trim()
  const m = t.match(/^(["'`])(.*)\1$/)
  return m ? m[2]! : t
}

function makePair(rawLabel: string, rawValue: string, spaced: boolean, strongSeparator: boolean): Pair | null {
  const label = unquote(rawLabel.replace(/\*\*/g, ''))
  const value = unquote(rawValue)
  const words = label.split(' ')
  if (!label || label.length > 32 || words.length > 4) return null
  if (!/^[\p{L}\p{N}]/u.test(label) || !/\p{L}/u.test(label) || /[@/\\]/.test(label)) return null
  // A key is a name, not a value: "1.2.3.4", "a@b.com" or "代理 1.2.3.4" are not keys.
  if (classify(label) !== 'plain') return null
  const known = KNOWN_LABELS.has(norm(label))
  if (!known && words.length > 1 && /\d/.test(label)) return null
  if (value && INLINE_LABEL_RE.test(value)) return null
  if (spaced) {
    const tokens = value.split(/\s+/)
    if (tokens.length > (known ? 6 : 3) || tokens.some((t) => ALIAS_TO_ROLE.has(t.toLowerCase()))) return null
  }
  if (!known && (label.length > (spaced ? 16 : 24) || value.length > 120 || /[，。！？]/.test(value))) return null
  const strong = !spaced && (strongSeparator || CJK.test(label) || words.length > 1)
  return { label, value, key: label, known, spaced, strong: strong || known }
}

/** "key: value", "key=value", "key value" … → the pair, or null when the line is something else. */
function splitPair(raw: string): Pair | null {
  const line = cleanLine(raw)
  // A URL, a proxy or a host:port is a value on its own. ("a@b.com:pw" is rejected by its key.)
  const kind = classify(line)
  if (kind === 'url' || kind === 'proxy' || kind === 'host' || kind === 'date' || kind === 'totp') return null
  const bracket = line.match(BRACKETED)
  if (bracket) {
    const p = makePair(bracket[1]!, bracket[2]!, false, true)
    if (p) return p
  }
  const m = line.match(SEPARATOR)
  if (m && m.index! > 0) {
    const sep = m[2]!.trim() || 'tab'
    // A bare "user:pass" is weak evidence; "Key: value" with a space is a label.
    const strong = STRONG_SEPARATORS.has(sep) || (sep === ':' && m[3]!.length > 0)
    const p = makePair(line.slice(0, m.index), line.slice(m.index! + m[0].length), false, strong)
    if (p) return p
  }
  // Whitespace only. A known label may have several words ("Recovery email a@b.com").
  const words = line.split(/\s+/)
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const label = words.slice(0, n).join(' ')
    if (n > 1 && !KNOWN_LABELS.has(norm(label))) continue
    const p = makePair(label, words.slice(n).join(' '), true, false)
    if (p) return p
  }
  return null
}

/** "a=1; b=2", "a:1 b:2": several pairs on one line → one line per pair. */
function expandLine(line: string): string[] {
  for (const d of [/\s*[;；&]\s*/, /\s*[,，]\s*/, /\s+/]) {
    const parts = line.split(d).filter(Boolean)
    if (parts.length >= 2 && parts.every((p) => splitPair(p)?.value && !splitPair(p)!.spaced)) return parts
  }
  return [line]
}

/** Values for a list of pairs, in order. Repeated roles stay fields under their own label. */
function pairsToValues(pairs: Pair[]): ParsedValue[] {
  const taken = new Set<FieldRole>()
  return pairs.map((p) => {
    const meaning = p.known ? meaningFor(p.key, p.value, taken) : { type: shapeType(p.value) }
    const v: ParsedValue = { value: p.value, label: p.label, type: meaning.type }
    if (meaning.role) {
      v.role = meaning.role
      taken.add(meaning.role)
    }
    return v
  })
}

/**
 * Text made of key-value lines, which is what "copy card" writes and what most notes look like. Unknown keys
 * become fields of their own. Lines that are not pairs go to notes, or continue a multi-line value.
 *
 * "alice:secret1" lines alone are login pairs (bulk), not keys, so this needs evidence first: a known label, a
 * clear separator ("Key: v", "k=v", "键：v"), or forms mixed within one paragraph ("a:a1" next to "c c1").
 */
function parseKeyValues(text: string): ParsedEntry | null {
  const lines: Array<{ line: string; para: number; pair: Pair | null; inline: boolean }> = []
  text.split(/\n[ \t]*\n/).forEach((paragraph, para) => {
    for (const raw of paragraph.split('\n')) {
      const trimmed = raw.trim()
      if (!trimmed || SECTION.test(trimmed)) continue
      const parts = expandLine(trimmed)
      for (const line of parts) lines.push({ line, para, pair: splitPair(line), inline: parts.length > 1 })
    }
  })

  const paras = new Map<number, { explicit: boolean; spaced: boolean; strong: boolean }>()
  for (const l of lines) {
    if (!l.pair) continue
    const p = paras.get(l.para) ?? { explicit: false, spaced: false, strong: false }
    if (l.pair.spaced) p.spaced = true
    else p.explicit = true
    if (l.pair.strong || l.inline) p.strong = true
    paras.set(l.para, p)
  }
  const evidence = [...paras.values()].some((p) => p.strong || (p.explicit && p.spaced))
  if (!evidence) return null
  // "c c1" only counts next to explicit pairs; elsewhere "首次登录 请改密码" is just a sentence.
  for (const l of lines) {
    if (l.pair?.spaced && !l.pair.known && !paras.get(l.para)?.explicit) l.pair = null
  }
  const count = lines.filter((l) => l.pair).length
  if (count * 2 < lines.length && count < 3) return null

  const pairs: Pair[] = []
  const rest: string[] = []
  let last: Pair | undefined
  for (const l of lines) {
    if (l.pair) {
      last = l.pair.value ? l.pair : undefined
      if (last) pairs.push(last)
      continue
    }
    // "copy card" writes a multi-line value as is, so its later lines carry no key.
    if (last && meaningFor(last.key, last.value, new Set()).type === 'multiline') last.value += `\n${l.line}`
    else {
      rest.push(l.line)
      last = undefined
    }
  }
  return { values: pairsToValues(pairs), rest: tidy(rest.join('\n')) }
}

// --- JSON --------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function jsonPairs(o: Record<string, unknown>, prefix = ''): Pair[] {
  const out: Pair[] = []
  for (const [k, v] of Object.entries(o)) {
    const label = `${prefix}${k}`
    if (isRecord(v)) out.push(...jsonPairs(v, `${label}.`))
    else if (v === null || v === undefined || v === '') continue
    else {
      const value = Array.isArray(v)
        ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
        : String(v)
      out.push({ label, value, key: k, known: KNOWN_LABELS.has(norm(k)), spaced: false, strong: true })
    }
  }
  return out
}

/** A JSON object is one entry; an array of objects is one entry per object. */
function parseJson(text: string): PasteResult | null {
  if (!/^[[{]/.test(text)) return null
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const entry = (o: Record<string, unknown>): ParsedEntry => ({ values: pairsToValues(jsonPairs(o)), rest: '' })
  if (isRecord(data)) return { mode: 'single', entries: [entry(data)] }
  if (Array.isArray(data) && data.length > 0 && data.every(isRecord)) {
    return { mode: data.length > 1 ? 'bulk' : 'single', entries: data.map(entry) }
  }
  return null
}

// --- entry point -------------------------------------------------------------

const DELIMITERS = [/\s*-{3,}\s*/, /\t/, /\s*\|\s*/, /\s*,\s*/, /\s+/]

/** Splits one line on the strongest delimiter it contains. */
function splitLine(line: string): string[] {
  for (const d of DELIMITERS) {
    const parts = line.split(d).filter(Boolean)
    if (parts.length >= 2) return parts
  }
  return [line]
}

/** A line that stands on its own as a record: several values, or a proxy URI. */
function isRecordLine(tokens: string[]) {
  return tokens.length >= 2 || (tokens.length === 1 && classify(tokens[0]!) === 'proxy')
}

function hasLabels(text: string): boolean {
  LABEL_RE.lastIndex = 0
  for (const m of text.matchAll(LABEL_RE)) {
    if (!m[2]) continue
    // English words are only labels when followed by a separator ("Email: …").
    if (CJK.test(m[1]!) || /^\s*[:：=]/.test(m[0].slice(m[1]!.length))) return true
  }
  return false
}

export function parsePaste(input: string): PasteResult {
  let text = input.replace(/\r\n?/g, '\n').trim()
  if (!text) return { mode: 'single', entries: [] }

  const json = parseJson(text)
  if (json) return json

  // "Copy all" on an item writes its name, a blank line, then "[Card title]" and the fields.
  const head = text.match(/^([^\n[]+)\n[ \t]*\n(?=\[[^\]\n]+\]\n)/)
  const name = head?.[1]?.trim()
  if (head) text = text.slice(head[0].length)

  const pairs = parseKeyValues(text)
  if (pairs) return { mode: 'single', entries: [name ? { ...pairs, name } : pairs] }
  if (head) text = input.replace(/\r\n?/g, '\n').trim()

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (!hasLabels(text)) {
    const rows = lines.map(splitLine)
    if (rows.length > 1 && rows.every(isRecordLine)) {
      return { mode: 'bulk', entries: rows.map(assignByShape) }
    }
    const tokens = rows.length === 1 ? rows[0]! : text.split(/\s+/)
    return { mode: 'single', entries: [assignByShape(tokens)] }
  }

  return { mode: 'single', entries: [parseLabelled(text) ?? { values: [], rest: text }] }
}

// --- mapping onto a card -----------------------------------------------------

const EMAIL_DOMAINS: Array<[RegExp, string]> = [
  [/@(gmail|googlemail)\.com$/i, 'google'],
  [/@(outlook|hotmail|live|msn)\.[a-z.]+$/i, 'microsoft'],
  [/@(icloud|me|mac)\.com$/i, 'apple'],
]

/**
 * The template that best fits the entry. A copied card names its fields, so the template whose labels match
 * the most wins ("网络名称 + 密码" is Wi-Fi). Otherwise, or on a tie, the values decide.
 */
export function guessTemplate(entry: ParsedEntry): string {
  const byShape = guessByShape(entry)
  if (entry.values.filter((v) => v.label).length < 2) return byShape
  // How many values have a slot in the template: by label ("端口"), or by role (username ↔ account).
  const score = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return 0
    const roles = new Set(t.fields.map((f) => f.role))
    const fits = (v: ParsedValue) =>
      (v.label && TEMPLATE_LABELS.get(id)?.has(norm(v.label))) ||
      (v.role &&
        (roles.has(v.role) ||
          (v.role === 'username' && roles.has('account')) ||
          (v.role === 'account' && roles.has('username')))) ||
      (id === 'proxy' && v === portOf(entry))
    return entry.values.filter(fits).length
  }
  let best = byShape
  let bestScore = score(byShape)
  for (const t of TEMPLATES) {
    if (t.id === CUSTOM_TEMPLATE_ID) continue
    const s = score(t.id)
    if (s > bestScore) {
      best = t.id
      bestScore = s
    }
  }
  return bestScore >= 2 ? best : byShape
}

function guessByShape(entry: ParsedEntry): string {
  const get = (role: FieldRole) => entry.values.find((v) => v.role === role)?.value
  const host = entry.values.find((v) => v.role === 'host')
  if (host) {
    // "主机 / 服务器 + 端口" is a server; "IP / 代理 + 端口" is how proxies are sold.
    const server = host.label && SERVER_LABELS.has(norm(host.label)) && portOf(entry)
    return server ? 'server' : 'proxy'
  }
  const account = get('account')
  if (account) {
    for (const [re, id] of EMAIL_DOMAINS) if (re.test(account)) return id
    if (get('url')) return 'website'
    if (EMAIL.test(account)) return 'email'
    return 'website'
  }
  if (get('url')) return 'website'
  return 'custom'
}

export function guessName(entry: ParsedEntry): string {
  if (entry.name) return entry.name
  const found = entry.values.find((v) => v.role === 'account' || v.role === 'host')
  // A proxy address may carry its scheme ("socks5://1.2.3.4:1080"); the name doesn't need it.
  const account = (found?.value ?? '').replace(/^[a-z][\w+.-]*:\/\//i, '')
  return account.includes('@') ? account.split('@')[0]! : account
}

const PORT_LABELS = new Set(['port', '端口', '端口号'])
const SERVER_LABELS = new Set(['主机', '服务器', '服务器地址', 'host', 'server', 'hostname'])

/** The pasted "端口 / port" value, when there is one. */
function portOf(entry: ParsedEntry) {
  return entry.values.find((v) => !v.role && v.label && PORT_LABELS.has(norm(v.label)) && /^\d{1,5}$/.test(v.value))
}

/** A proxy card keeps the port in its address, so "IP: 1.2.3.4" + "端口: 8080" becomes "1.2.3.4:8080". */
function joinProxyPort(entry: ParsedEntry): ParsedValue[] {
  const port = portOf(entry)
  const host = entry.values.find((v) => v.role === 'host')
  if (!port || !host || /:\d+\/?$/.test(host.value)) return entry.values
  return entry.values.flatMap((v) =>
    v === port ? [] : v === host ? [{ ...v, value: `${v.value}:${port.value}` }] : [v],
  )
}

/** Builds a card from a template and fills it with parsed values. */
/**
 * Builds a card from a template and fills it with parsed values. Template slots the paste left empty are dropped,
 * so the card shows only what was pasted; when nothing was recognised the template is kept to be filled by hand.
 */
export function entryToCard(entry: ParsedEntry, templateId: string, locale: string): Card {
  const card = createCard(templateId, locale)
  if (templateId === 'custom') card.fields = []
  const values = templateId === 'proxy' ? joinProxyPort(entry) : entry.values
  for (const { role, value, label, type } of values) {
    // A pasted label names its slot ("端口", "API Key"), even when two slots share a role or a spelling.
    const slot =
      (label ? card.fields.find((f) => !f.value && norm(f.label) === norm(label)) : undefined) ??
      (role
        ? (card.fields.find((f) => f.role === role && !f.value) ??
          (role === 'username' ? card.fields.find((f) => f.role === 'account' && !f.value) : undefined) ??
          (role === 'account' ? card.fields.find((f) => f.role === 'username' && !f.value) : undefined))
        : undefined)
    if (slot) slot.value = value
    else {
      const d = role ? ROLE_DEFAULTS[role] : undefined
      card.fields.push(
        createField({
          label: label ?? (d ? pick(d.label, locale) : ''),
          type: type ?? d?.type ?? 'text',
          value,
          role,
        }),
      )
    }
  }
  if (card.fields.some((f) => f.value)) card.fields = card.fields.filter((f) => f.value)
  return card
}
