import type { Locale } from './i18n'
import { pick } from './i18n'
import type { Card, FieldRole } from './schema'
import { createCard, createField, ROLE_DEFAULTS } from './templates'
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
 */

export interface ParsedValue {
  role: FieldRole
  value: string
}

export interface ParsedEntry {
  values: ParsedValue[]
  /** Text that couldn't be assigned to a field. Goes to notes. */
  rest: string
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
  ['account', ['账号', '帐号', '账户', '帐户', '邮箱', 'apple id', 'email', 'e-mail', 'account', 'login', 'mail']],
  ['username', ['用户名', 'username', 'user']],
  ['phone', ['手机号码', '手机号', '手机', '电话', 'phone', 'mobile', 'tel']],
  ['host', ['代理', 'proxy', 'ip地址', 'ip', 'host']],
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
    values.push({ role, value })
    consumed.push([m.index, m.index + m[0].length])
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
  const text = input.replace(/\r\n?/g, '\n').trim()
  if (!text) return { mode: 'single', entries: [] }
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

export function guessTemplate(entry: ParsedEntry): string {
  const get = (role: FieldRole) => entry.values.find((v) => v.role === role)?.value
  if (get('host')) return 'proxy'
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
  const found = entry.values.find((v) => v.role === 'account' || v.role === 'host')
  // A proxy address may carry its scheme ("socks5://1.2.3.4:1080"); the name doesn't need it.
  const account = (found?.value ?? '').replace(/^[a-z][\w+.-]*:\/\//i, '')
  return account.includes('@') ? account.split('@')[0]! : account
}

/** Builds a card from a template and fills it with parsed values. */
export function entryToCard(entry: ParsedEntry, templateId: string, locale: Locale): Card {
  const card = createCard(templateId, locale)
  if (templateId === 'custom') card.fields = []
  for (const { role, value } of entry.values) {
    const slot =
      card.fields.find((f) => f.role === role && !f.value) ??
      (role === 'username' ? card.fields.find((f) => f.role === 'account' && !f.value) : undefined) ??
      (role === 'account' ? card.fields.find((f) => f.role === 'username' && !f.value) : undefined)
    if (slot) slot.value = value
    else {
      const d = ROLE_DEFAULTS[role]
      card.fields.push(createField({ label: pick(d.label, locale), type: d.type, value, role }))
    }
  }
  return card
}
