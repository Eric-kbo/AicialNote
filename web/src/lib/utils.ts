import type { T } from '../i18n'

export { clsx as cn } from 'clsx'

export function relativeTime(iso: string | number, t: T, now = Date.now()): string {
  const time = typeof iso === 'number' ? iso : new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const diff = Math.max(0, now - time)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('common.justNow')
  if (min < 60) return t('common.minutesAgo', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('common.hoursAgo', { n: h })
  const d = Math.floor(h / 24)
  if (d === 1) return t('common.yesterday')
  if (d < 30) return t('common.daysAgo', { n: d })
  return absoluteDate(time)
}

export function absoluteDate(time: string | number): string {
  const d = new Date(time)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function absoluteTime(time: string | number): string {
  const d = new Date(time)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${absoluteDate(time)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const modKey = isMac ? '⌘' : 'Ctrl'

/** Groups a TOTP code for readability: "482913" → "482 913". */
export function groupCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}
