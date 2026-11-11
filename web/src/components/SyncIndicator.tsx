import { AlertCircle, Check, CloudOff, KeyRound, Loader2, RefreshCw } from 'lucide-react'
import { usePendingCount, useSyncStatus, useVault } from '../data/vault'
import { useI18n } from '../i18n'
import { absoluteTime, cn, relativeTime } from '../lib/utils'
import { useSession } from '../session'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './ui/menu'

export function SyncIndicator() {
  const { t } = useI18n()
  const status = useSyncStatus()
  const pending = usePendingCount()
  const { actions } = useVault()
  const { reauth } = useSession()

  let icon = <Check />
  let label = t('sync.synced')
  let tone = 'text-fg-3'
  switch (status.phase) {
    case 'syncing':
      icon = <Loader2 className="animate-spin" />
      label = t('sync.syncing')
      break
    case 'offline':
      icon = <CloudOff />
      label = t('sync.offline')
      break
    case 'auth':
      icon = <KeyRound />
      label = t('sync.auth')
      tone = 'text-st-yellow'
      break
    case 'error':
    case 'blocked':
      icon = <AlertCircle />
      label = t('sync.error')
      tone = 'text-st-red'
      break
    default:
      if (pending > 0) {
        icon = <RefreshCw />
        label = t('sync.pending', { n: pending })
      } else if (!status.lastSyncedAt) {
        icon = <Loader2 className="animate-spin" />
        label = t('sync.syncing')
      }
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-hover data-[state=open]:bg-hover [&_svg]:size-3.5',
            tone,
          )}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuLabel>
          <span className="block text-fg">{label}</span>
          <span className="mt-0.5 block">
            {status.lastSyncedAt
              ? t('sync.last', {
                  time: `${relativeTime(status.lastSyncedAt, t)} · ${absoluteTime(status.lastSyncedAt)}`,
                })
              : t('sync.never')}
          </span>
          {status.error && <span className="mt-1.5 block break-words text-st-red">{status.error}</span>}
          {status.phase === 'auth' && status.missingScope && (
            <span className="mt-1.5 block text-fg-2">{t('sync.authScope')}</span>
          )}
        </MenuLabel>
        <MenuSeparator />
        {status.phase === 'auth' ? (
          <MenuItem icon={<KeyRound />} onSelect={reauth}>
            {t('sync.reauth')}
          </MenuItem>
        ) : (
          <MenuItem icon={<RefreshCw />} onSelect={() => actions.syncNow()}>
            {t('sync.now')}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  )
}
