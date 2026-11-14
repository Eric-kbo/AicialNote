import { type Localized, pick } from './i18n'
import { shortId } from './ids'
import type { Card, Field, FieldRole, FieldType, Status, VaultMeta } from './schema'
import { FORMAT_VERSION, VAULT_FORMAT } from './schema'

export interface TemplateField {
  label: Localized
  type: FieldType
  role?: FieldRole
}

export interface Template {
  id: string
  name: Localized
  /** Icon key, resolved by the UI. */
  icon: string
  /** Accent hue, resolved by the UI. */
  tint: 'blue' | 'green' | 'orange' | 'red' | 'violet' | 'gray' | 'teal'
  fields: TemplateField[]
}

const L = (zh: string, en: string): Localized => ({ zh, en })

const f = {
  email: { label: L('邮箱', 'Email'), type: 'email', role: 'account' },
  password: { label: L('密码', 'Password'), type: 'password', role: 'password' },
  totp: { label: L('2FA', '2FA'), type: 'totp', role: 'totp' },
  recovery: { label: L('辅助邮箱', 'Recovery email'), type: 'email', role: 'recovery' },
  phone: { label: L('手机号', 'Phone'), type: 'phone', role: 'phone' },
  region: { label: L('地区', 'Region'), type: 'text', role: 'region' },
  expires: { label: L('过期时间', 'Expires'), type: 'date', role: 'expires' },
  username: { label: L('用户名', 'Username'), type: 'text', role: 'username' },
  name: { label: L('姓名', 'Name'), type: 'text', role: 'name' },
  // Same in every language, like a brand name. A password-type field, so it stays out of search.
  apiKey: { label: L('API Key', 'API Key'), type: 'password' },
} satisfies Record<string, TemplateField>

export const TEMPLATES: Template[] = [
  {
    id: 'google',
    name: L('Google', 'Google'),
    icon: 'google',
    tint: 'blue',
    fields: [f.email, f.password, f.totp, f.recovery, f.phone],
  },
  {
    id: 'apple',
    name: L('Apple ID', 'Apple ID'),
    icon: 'apple',
    tint: 'gray',
    fields: [{ ...f.email, label: L('Apple ID', 'Apple ID') }, f.password, f.phone, f.region],
  },
  {
    id: 'microsoft',
    name: L('Microsoft', 'Microsoft'),
    icon: 'microsoft',
    tint: 'teal',
    fields: [f.email, f.password, f.totp, f.recovery],
  },
  {
    id: 'openai',
    name: L('OpenAI', 'OpenAI'),
    icon: 'openai',
    tint: 'gray',
    fields: [f.email, f.password, f.totp, f.apiKey],
  },
  {
    id: 'claude',
    name: L('Claude', 'Claude'),
    icon: 'claude',
    tint: 'orange',
    // Claude signs in with an emailed code or Google, so there is no password slot.
    fields: [f.email, f.phone, f.apiKey],
  },
  {
    id: 'email',
    name: L('邮箱', 'Email'),
    icon: 'mail',
    tint: 'orange',
    fields: [f.email, f.password, f.totp, f.recovery],
  },
  {
    id: 'website',
    name: L('网站账号', 'Website'),
    icon: 'link',
    tint: 'violet',
    fields: [
      { label: L('网址', 'URL'), type: 'url', role: 'url' },
      { label: L('账号', 'Account'), type: 'text', role: 'account' },
      f.password,
      f.totp,
    ],
  },
  {
    id: 'apikey',
    name: L('API 密钥', 'API key'),
    icon: 'key',
    tint: 'violet',
    fields: [f.apiKey, { label: L('Base URL', 'Base URL'), type: 'url', role: 'url' }, f.expires],
  },
  {
    id: 'proxy',
    name: L('代理 IP', 'Proxy'),
    icon: 'globe',
    tint: 'green',
    fields: [{ label: L('地址', 'Address'), type: 'text', role: 'host' }, f.username, f.password, f.region, f.expires],
  },
  {
    id: 'server',
    name: L('服务器', 'Server'),
    icon: 'server',
    tint: 'teal',
    fields: [
      { label: L('主机', 'Host'), type: 'text', role: 'host' },
      { label: L('端口', 'Port'), type: 'text' },
      f.username,
      f.password,
      f.expires,
    ],
  },
  {
    id: 'wifi',
    name: L('Wi-Fi', 'Wi-Fi'),
    icon: 'wifi',
    tint: 'blue',
    fields: [{ label: L('网络名称', 'Network name'), type: 'text' }, f.password],
  },
  {
    id: 'bank',
    name: L('银行卡', 'Bank card'),
    icon: 'card',
    tint: 'green',
    fields: [
      { label: L('银行', 'Bank'), type: 'text' },
      { label: L('卡号', 'Card number'), type: 'text' },
      { ...f.name, label: L('持卡人', 'Cardholder') },
      { label: L('有效期', 'Valid thru'), type: 'text' },
      { label: L('CVV', 'CVV'), type: 'password' },
      { label: L('取款密码', 'PIN'), type: 'password' },
      f.phone,
    ],
  },
  {
    id: 'address',
    name: L('收货地址', 'Shipping address'),
    icon: 'pin',
    tint: 'orange',
    fields: [
      { ...f.name, label: L('收件人', 'Recipient') },
      f.phone,
      f.region,
      { label: L('详细地址', 'Street address'), type: 'multiline', role: 'address' },
      { label: L('邮编', 'Postal code'), type: 'text' },
    ],
  },
  {
    id: 'profile',
    name: L('身份资料', 'Profile'),
    icon: 'user',
    tint: 'red',
    fields: [
      f.name,
      { label: L('生日', 'Birthday'), type: 'date', role: 'birthday' },
      f.phone,
      { label: L('地址', 'Address'), type: 'multiline', role: 'address' },
    ],
  },
  {
    id: 'document',
    name: L('证件', 'ID document'),
    icon: 'id',
    tint: 'blue',
    fields: [
      f.name,
      { label: L('证件类型', 'Document type'), type: 'text' },
      { label: L('证件号码', 'Document number'), type: 'text' },
      { ...f.expires, label: L('有效期至', 'Valid until') },
    ],
  },
  {
    id: 'custom',
    name: L('自定义', 'Custom'),
    icon: 'shapes',
    tint: 'gray',
    fields: [{ label: L('字段', 'Field'), type: 'text' }],
  },
]

export const CUSTOM_TEMPLATE_ID = 'custom'

export function getTemplate(id: string | undefined): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export interface FieldInput {
  label: string
  type: FieldType
  value: string
  role?: FieldRole
}

export function createField(input: FieldInput): Field {
  const field: Field = { id: shortId(), label: input.label, type: input.type, value: input.value }
  if (input.role) field.role = input.role
  return field
}

export function createCard(templateId: string, locale: string): Card {
  const t = getTemplate(templateId) ?? getTemplate(CUSTOM_TEMPLATE_ID)!
  return {
    id: shortId(),
    template: t.id,
    title: pick(t.name, locale),
    fields: t.fields.map((tf) =>
      createField({ label: pick(tf.label, locale), type: tf.type, value: '', role: tf.role }),
    ),
  }
}

/** Label and type to use when a value of this role has no slot in a card. */
export const ROLE_DEFAULTS: Record<FieldRole, { label: Localized; type: FieldType }> = {
  account: { label: L('账号', 'Account'), type: 'text' },
  username: { label: L('用户名', 'Username'), type: 'text' },
  password: { label: L('密码', 'Password'), type: 'password' },
  totp: { label: L('2FA', '2FA'), type: 'totp' },
  recovery: { label: L('辅助邮箱', 'Recovery email'), type: 'email' },
  phone: { label: L('手机号', 'Phone'), type: 'phone' },
  host: { label: L('地址', 'Address'), type: 'text' },
  region: { label: L('地区', 'Region'), type: 'text' },
  expires: { label: L('过期时间', 'Expires'), type: 'date' },
  url: { label: L('网址', 'URL'), type: 'url' },
  name: { label: L('姓名', 'Name'), type: 'text' },
  birthday: { label: L('生日', 'Birthday'), type: 'date' },
  address: { label: L('地址', 'Address'), type: 'multiline' },
}

export function defaultStatuses(locale: string): Status[] {
  const s = (id: string, zh: string, en: string, color: Status['color']): Status => ({
    id,
    label: pick({ zh, en }, locale),
    color,
  })
  return [
    s('active', '正常', 'Active', 'green'),
    // The id is kept for compatibility: existing vaults and items refer to it.
    s('warming', '准备中', 'Setting up', 'blue'),
    s('attention', '异常', 'Needs attention', 'yellow'),
    s('banned', '封禁', 'Banned', 'red'),
    s('retired', '停用', 'Retired', 'gray'),
  ]
}

/**
 * Default labels that an earlier version wrote into vault.json: [status id, old label, current label].
 * When a default label in `defaultStatuses` changes, add its old spelling here in the same change.
 */
const RENAMED_STATUS_LABELS: ReadonlyArray<readonly [id: string, was: string, now: string]> = [
  ['warming', '养号中', '准备中'],
  ['warming', 'Warming up', 'Setting up'],
]

/**
 * Brings defaults that an earlier version wrote into vault.json up to date. A label is renamed only while it
 * still equals the old default exactly, so a name the user chose is never touched. Returns the same object when
 * nothing needs to change.
 */
export function migrateVaultMeta(meta: VaultMeta): VaultMeta {
  let changed = false
  const statuses = meta.statuses.map((status) => {
    const rename = RENAMED_STATUS_LABELS.find(([id, was]) => id === status.id && was === status.label)
    if (!rename) return status
    changed = true
    return { ...status, label: rename[2] }
  })
  return changed ? { ...meta, statuses } : meta
}

export function createVaultMeta(locale: string, now = new Date()): VaultMeta {
  return {
    format: VAULT_FORMAT,
    formatVersion: FORMAT_VERSION,
    createdAt: now.toISOString(),
    locale,
    nextSeq: 1,
    statuses: defaultStatuses(locale),
  }
}
