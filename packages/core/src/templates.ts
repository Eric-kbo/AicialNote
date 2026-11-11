import { type Locale, type Localized, pick } from './i18n'
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
    id: 'email',
    name: L('邮箱', 'Email'),
    icon: 'mail',
    tint: 'orange',
    fields: [f.email, f.password, f.totp, f.recovery],
  },
  {
    id: 'proxy',
    name: L('代理 IP', 'Proxy'),
    icon: 'globe',
    tint: 'green',
    fields: [
      { label: L('地址', 'Address'), type: 'text', role: 'host' },
      { label: L('用户名', 'Username'), type: 'text', role: 'username' },
      f.password,
      f.region,
      { label: L('过期时间', 'Expires'), type: 'date', role: 'expires' },
    ],
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
    id: 'profile',
    name: L('身份资料', 'Profile'),
    icon: 'user',
    tint: 'red',
    fields: [
      { label: L('姓名', 'Name'), type: 'text', role: 'name' },
      { label: L('生日', 'Birthday'), type: 'date', role: 'birthday' },
      f.phone,
      { label: L('地址', 'Address'), type: 'multiline', role: 'address' },
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

export function createCard(templateId: string, locale: Locale): Card {
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

export function defaultStatuses(locale: Locale): Status[] {
  const s = (id: string, zh: string, en: string, color: Status['color']): Status => ({
    id,
    label: locale === 'zh' ? zh : en,
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

export function createVaultMeta(locale: Locale, now = new Date()): VaultMeta {
  return {
    format: VAULT_FORMAT,
    formatVersion: FORMAT_VERSION,
    createdAt: now.toISOString(),
    locale,
    nextSeq: 1,
    statuses: defaultStatuses(locale),
  }
}
