import {
  type Card,
  defaultProxyFormat,
  formatProxy,
  PROXY_FORMATS,
  type ProxyFormat,
  type ProxyParts,
  proxyFromCard,
} from '@aicialnote/core'
import { Check, ChevronDown, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type MessageKey, useT } from '../i18n'
import { setPrefs, usePrefs } from '../lib/prefs'
import { copyText } from '../lib/utils'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from './ui/menu'

const LABEL: Record<ProxyFormat, MessageKey> = {
  socks5: 'proxy.socks5',
  http: 'proxy.http',
  https: 'proxy.https',
  colon: 'proxy.colon',
  at: 'proxy.at',
}

const MASK = 'AICIALNOTEMASK'

/** The string as it would be copied, with the password hidden (menus are on screen). */
function preview(p: ProxyParts, format: ProxyFormat) {
  return formatProxy({ ...p, password: p.password ? MASK : '' }, format).replace(MASK, '••••')
}

/**
 * "Copy proxy" split button for cards that hold a proxy address. The main part
 * copies in the current format; the arrow lists every format with a preview.
 * The format follows the scheme written in the card (socks5://…), otherwise
 * the one used last on this device.
 */
export function ProxyCopy({ card }: { card: Card }) {
  const t = useT()
  const prefs = usePrefs()
  const [copied, setCopied] = useState(false)
  const parts = proxyFromCard(card)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  if (!parts) return null
  const format: ProxyFormat = defaultProxyFormat(parts) ?? prefs.proxyFormat ?? 'socks5'

  const copy = async (f: ProxyFormat) => {
    setPrefs((p) => ({ ...p, proxyFormat: f }))
    if (await copyText(formatProxy(parts, f))) setCopied(true)
  }

  if (copied)
    return (
      <span className="flex h-7 items-center gap-1 px-1.5 text-xs font-medium text-accent" data-proxy-copied>
        <Check className="size-3.5" />
        {t('field.copied')}
      </span>
    )

  return (
    <div className="flex items-center rounded-md hover:bg-hover has-[[data-state=open]]:bg-hover">
      <button
        type="button"
        data-proxy-copy
        title={preview(parts, format)}
        onClick={() => void copy(format)}
        className="inline-flex h-7 items-center gap-1.5 rounded-l-md pr-1 pl-2 text-xs text-fg-2 hover:text-fg"
      >
        <Link2 className="size-3.5 text-fg-3" />
        {t('proxy.copy')}
        <span className="font-mono text-fg-3">{format === 'colon' || format === 'at' ? '' : `${format}://`}</span>
      </button>
      <Menu modal={false}>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={t('proxy.formats')}
            className="inline-flex h-7 w-5 items-center justify-center rounded-r-md text-fg-3 hover:text-fg"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-[340px]">
          <MenuLabel>{t('proxy.formats')}</MenuLabel>
          {PROXY_FORMATS.map((f) => (
            <MenuItem key={f} onSelect={() => void copy(f)} className="h-auto py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className={f === format ? 'font-medium text-accent' : undefined}>{t(LABEL[f])}</span>
                <span className="truncate font-mono text-2xs text-fg-3">{preview(parts, f)}</span>
              </span>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  )
}
