import { FlaskConical, FolderOpen, HardDrive, Loader2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { LegalLinks, PublicHeader } from '../components/PublicHeader'
import { fetchProviders, type ProviderInfo } from '../data/auth'
import { type MessageKey, useI18n } from '../i18n'
import { cn } from '../lib/utils'
import { supportsLocalFolder, useSession } from '../session'

export function ConnectPage({ error }: { error?: string }) {
  const { t } = useI18n()
  const { connectCloud, connectLocal, connectDemo } = useSession()
  const [providers, setProviders] = useState<ProviderInfo[] | null | undefined>(undefined)

  useEffect(() => {
    void fetchProviders().then(setProviders)
  }, [])

  const enabled = (id: string) => providers?.some((p) => p.id === id) ?? false
  const errorKey = `connect.error.${error}` as MessageKey
  const errorText = error
    ? t(errorKey) !== errorKey
      ? t(errorKey)
      : t('connect.error.generic', { code: error })
    : null

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />

      <main className="flex flex-1 items-start justify-center px-5 pt-[12vh] pb-16">
        <div className="w-full max-w-[400px]">
          <h1 className="text-[26px] leading-[34px] font-semibold tracking-[-0.02em] text-balance">
            {t('connect.title')}
          </h1>
          <p className="mt-3 text-[14px] leading-[22px] text-fg-2 text-pretty">{t('connect.subtitle')}</p>

          {errorText && (
            <div className="mt-6 rounded-lg border border-[color-mix(in_oklab,var(--st-red)_30%,transparent)] bg-[color-mix(in_oklab,var(--st-red)_7%,transparent)] px-3 py-2.5 text-sm text-st-red">
              {errorText}
            </div>
          )}

          <div className="mt-8 flex flex-col gap-2.5">
            <ProviderButton
              icon={<GoogleDriveIcon />}
              label={t('connect.google')}
              hint={t('connect.where.google')}
              disabled={!enabled('google')}
              loading={providers === undefined}
              unavailable={providers !== undefined && !enabled('google') ? t('connect.unavailable') : undefined}
              onClick={() => connectCloud('google')}
            />
            <ProviderButton
              icon={<OneDriveIcon />}
              label={t('connect.microsoft')}
              hint={t('connect.where.microsoft')}
              disabled={!enabled('microsoft')}
              loading={providers === undefined}
              unavailable={providers !== undefined && !enabled('microsoft') ? t('connect.unavailable') : undefined}
              onClick={() => connectCloud('microsoft')}
            />
          </div>

          {providers === null && <p className="mt-3 text-xs text-fg-3">{t('connect.serverDown')}</p>}

          <div className="my-6 flex items-center gap-3 text-xs text-fg-3">
            <span className="h-px flex-1 bg-line" />
            {t('connect.or')}
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="flex flex-col gap-1">
            <SecondaryOption
              icon={<FolderOpen />}
              label={t('connect.local')}
              hint={supportsLocalFolder ? t('connect.localHint') : t('connect.localUnsupported')}
              disabled={!supportsLocalFolder}
              onClick={() => void connectLocal()}
            />
            {import.meta.env.DEV && (
              <SecondaryOption
                icon={<FlaskConical />}
                label={t('connect.demo')}
                hint={t('connect.demoHint')}
                onClick={() => void connectDemo()}
              />
            )}
          </div>
        </div>
      </main>

      <LegalLinks className="pb-6" />
    </div>
  )
}

function ProviderButton(props: {
  icon: ReactNode
  label: string
  hint: string
  disabled: boolean
  loading: boolean
  unavailable?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        'group flex h-[60px] items-center gap-3.5 rounded-xl border border-line bg-surface px-4 text-left',
        'shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150',
        'hover:border-line-strong hover:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08)]',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line disabled:hover:shadow-none',
      )}
    >
      <span className="flex size-8 items-center justify-center">{props.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-5 font-medium text-fg">{props.label}</span>
        <span className="block truncate text-xs text-fg-3">{props.hint}</span>
      </span>
      {props.loading ? (
        <Loader2 className="size-4 animate-spin text-fg-3" />
      ) : props.unavailable ? (
        <span className="rounded-md bg-subtle px-1.5 py-0.5 text-2xs text-fg-3">{props.unavailable}</span>
      ) : (
        <span className="text-fg-3 transition-transform duration-150 group-hover:translate-x-0.5">→</span>
      )}
    </button>
  )
}

function SecondaryOption(props: {
  icon: ReactNode
  label: string
  hint: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-hover disabled:opacity-50 disabled:hover:bg-transparent [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:text-fg-3"
    >
      {props.icon}
      <span>
        <span className="block text-sm font-medium text-fg">{props.label}</span>
        <span className="block text-xs text-fg-3">{props.hint}</span>
      </span>
    </button>
  )
}

function GoogleDriveIcon() {
  return (
    <svg viewBox="0 0 87.3 78" className="size-[26px]" aria-hidden>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47" />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z"
        fill="#ea4335"
      />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  )
}

function OneDriveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[28px]" aria-hidden>
      <path d="M9.6 8.2a6 6 0 0 1 10.1 2.4A4.3 4.3 0 0 1 23 14.8l-8.3-1.7z" fill="#0364b8" />
      <path d="M9.6 8.2 14.7 13l-9.6 5.3A4.5 4.5 0 0 1 5.6 9.4a5.6 5.6 0 0 1 4-1.2z" fill="#0078d4" />
      <path
        d="M19.7 10.6A4.3 4.3 0 0 1 23 14.8a4.2 4.2 0 0 1-4.2 4.2H7.6a4.5 4.5 0 0 1-2.5-.7l9.6-5.3z"
        fill="#1490df"
      />
      <path d="M5.1 18.3a4.5 4.5 0 0 0 2.5.7h11.2a4.2 4.2 0 0 0 4-3l-8.1-3z" fill="#28a8ea" />
    </svg>
  )
}

export function ResumeLocalPage({ name }: { name: string }) {
  const { t } = useI18n()
  const { resumeLocal, disconnect } = useSession()
  return (
    <div className="flex min-h-dvh items-start justify-center px-5 pt-[24vh]">
      <div className="w-full max-w-[360px] text-center">
        <span className="mx-auto mb-5 flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-fg-2">
          <HardDrive className="size-5" />
        </span>
        <h1 className="text-lg font-semibold">{t('connect.resume.title', { name })}</h1>
        <p className="mt-1.5 text-sm text-fg-2">{t('connect.resume.body')}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void resumeLocal()}
            className="h-9 rounded-lg bg-accent text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            {t('connect.resume.action')}
          </button>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="h-9 rounded-lg text-sm text-fg-2 hover:bg-hover hover:text-fg"
          >
            {t('connect.resume.switch')}
          </button>
        </div>
      </div>
    </div>
  )
}
