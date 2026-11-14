import { type MessageKey, useT } from '../i18n'
import { modKey } from '../lib/utils'
import { Dialog } from './ui/dialog'
import { Kbd } from './ui/kbd'
import { useUI } from './ui-state'

const SHORTCUTS: Array<[MessageKey, string[]]> = [
  ['shortcuts.search', [`${modKey}+K`]],
  ['shortcuts.filter', ['/']],
  ['shortcuts.move', ['J', 'K']],
  ['shortcuts.open', ['Enter']],
  ['shortcuts.new', ['N']],
  ['shortcuts.paste', [`${modKey}+V`]],
  ['shortcuts.back', ['Esc']],
  ['shortcuts.prevNext', ['K', 'J']],
  ['shortcuts.sidebar', [`${modKey}+\\`]],
  ['shortcuts.newPage', ['N']],
  ['shortcuts.indent', ['Tab', 'Shift+Tab']],
  ['shortcuts.slash', ['/']],
]

export function ShortcutsDialog() {
  const t = useT()
  const { shortcutsOpen, setShortcutsOpen } = useUI()
  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} title={t('shortcuts.title')} className="max-w-[420px]">
      <ul className="p-2">
        {SHORTCUTS.map(([key, keys]) => (
          <li key={key} className="flex h-9 items-center justify-between rounded-md px-2.5 text-sm">
            <span className="text-fg-2">{t(key)}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
