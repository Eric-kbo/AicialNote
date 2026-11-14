import { ChevronDown, Languages } from 'lucide-react'
import { htmlLang, LANGUAGES, useI18n } from '../i18n'
import { REPO_URL } from '../lib/links'
import { GitHubMark, Logo } from './icons'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from './ui/menu'

/** Top bar of the pages shown before sign-in: the start page and the legal pages. */
export function PublicHeader() {
  const { t, locale, setLocale } = useI18n()
  const current = LANGUAGES.find((l) => l.tag === locale)
  return (
    <header className="flex h-14 items-center justify-between px-5">
      <a href="/" className="flex items-center gap-2 text-fg">
        <Logo className="size-6" />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">AicialNote</span>
      </a>
      <div className="flex items-center gap-1">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('oss.github')}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-2 hover:bg-hover hover:text-fg"
        >
          <GitHubMark className="size-4" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              aria-label={t('account.language')}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-2 hover:bg-hover hover:text-fg"
            >
              <Languages className="size-4" />
              {current?.name}
              <ChevronDown className="size-3.5 text-fg-3" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuRadioGroup value={locale} onValueChange={(v) => void setLocale(v)}>
              {LANGUAGES.map((l) => (
                <MenuRadioItem key={l.tag} value={l.tag} lang={htmlLang(l.tag)}>
                  {l.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      </div>
    </header>
  )
}

/** Links to the privacy policy and terms. Google requires the home page to link to them. */
export function LegalLinks({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <nav className={className}>
      <ul className="flex items-center justify-center gap-4 text-xs text-fg-3">
        <li>
          <a href="/privacy" className="hover:text-fg-2">
            {t('legal.privacy.title')}
          </a>
        </li>
        <li>
          <a href="/terms" className="hover:text-fg-2">
            {t('legal.terms.title')}
          </a>
        </li>
      </ul>
    </nav>
  )
}
