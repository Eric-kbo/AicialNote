import { Download, Keyboard, Languages, LogOut, Monitor, Moon, Sun, Upload } from 'lucide-react'
import { usePendingCount, useVault } from '../data/vault'
import { htmlLang, LANGUAGES, useI18n } from '../i18n'
import { REPO_URL } from '../lib/links'
import { setTheme, type Theme, useTheme } from '../lib/theme'
import { useSession } from '../session'
import { GitHubMark } from './icons'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from './ui/menu'
import { useUI } from './ui-state'

export function AccountMenu() {
  const { t, locale, setLocale } = useI18n()
  const { connection } = useVault()
  const { disconnect } = useSession()
  const { setShortcutsOpen, setDataDialog } = useUI()
  const theme = useTheme()
  const pending = usePendingCount()

  const title =
    connection.kind === 'google' || connection.kind === 'microsoft'
      ? connection.name || connection.email
      : connection.kind === 'local'
        ? connection.folderName
        : t('account.storage.demo')
  const subtitle =
    connection.kind === 'google' || connection.kind === 'microsoft'
      ? `${t(`account.storage.${connection.kind}`)} · ${connection.email}`
      : t(`account.storage.${connection.kind}`)

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={title}
          className="inline-flex size-7 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))] text-xs font-semibold text-accent ring-1 ring-line hover:ring-line-strong data-[state=open]:ring-line-strong"
        >
          {(title || '?').slice(0, 1).toUpperCase()}
        </button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuLabel>
          <span className="block truncate text-sm font-medium text-fg">{title}</span>
          <span className="block truncate">{subtitle}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem icon={<Download />} onSelect={() => setDataDialog('export')}>
          {t('data.export.menu')}
        </MenuItem>
        <MenuItem icon={<Upload />} onSelect={() => setDataDialog('import')}>
          {t('data.import.menu')}
        </MenuItem>
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger icon={theme === 'dark' ? <Moon /> : theme === 'light' ? <Sun /> : <Monitor />}>
            {t('account.theme')}
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <MenuRadioItem value="system" icon={<Monitor />}>
                {t('account.theme.system')}
              </MenuRadioItem>
              <MenuRadioItem value="light" icon={<Sun />}>
                {t('account.theme.light')}
              </MenuRadioItem>
              <MenuRadioItem value="dark" icon={<Moon />}>
                {t('account.theme.dark')}
              </MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        <MenuSub>
          <MenuSubTrigger icon={<Languages />}>{t('account.language')}</MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup value={locale} onValueChange={(v) => void setLocale(v)}>
              {LANGUAGES.map((l) => (
                <MenuRadioItem key={l.tag} value={l.tag} lang={htmlLang(l.tag)}>
                  {l.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        <MenuItem icon={<Keyboard />} shortcut="?" onSelect={() => setShortcutsOpen(true)}>
          {t('account.shortcuts')}
        </MenuItem>
        <MenuItem icon={<GitHubMark />} onSelect={() => window.open(REPO_URL, '_blank', 'noopener,noreferrer')}>
          {t('oss.github')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={<LogOut />}
          onSelect={() => {
            if (pending > 0 && !window.confirm(t('account.signOutPending', { n: pending }))) return
            void disconnect()
          }}
        >
          {t('account.signOut')}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
