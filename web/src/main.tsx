import './styles.css'
import { RouterProvider } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { StrictMode, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import { UIStateProvider } from './components/ui-state'
import type { SyncEvent } from './data/sync'
import { NoteTreeProvider, VaultProvider } from './data/vault'
import { I18nProvider, useI18n } from './i18n'
import { ConnectPage, ResumeLocalPage } from './pages/ConnectPage'
import { LegalPage, legalDocFor } from './pages/LegalPage'
import { router } from './router'
import { SessionProvider, useSession } from './session'

function App() {
  const { session } = useSession()
  const { t, locale } = useI18n()

  const onSyncEvent = useCallback(
    (e: SyncEvent) => {
      if (e.type === 'conflict') toast(t('sync.conflict', { id: e.name }), { duration: 8000 })
      else console.warn('[sync] unreadable file left untouched:', e.path)
    },
    [t],
  )

  const legal = legalDocFor(window.location.pathname)
  if (legal) return <LegalPage doc={legal} />

  switch (session.state) {
    case 'loading':
      return (
        <div className="flex h-dvh items-center justify-center text-fg-3">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )
    case 'signedOut':
      return <ConnectPage error={session.error} />
    case 'resumeLocal':
      return <ResumeLocalPage name={session.handle.name} />
    case 'ready':
      return (
        <VaultProvider connection={session.connection} storage={session.storage} locale={locale} onEvent={onSyncEvent}>
          <UIStateProvider>
            <NoteTreeProvider>
              <RouterProvider router={router} />
            </NoteTreeProvider>
          </UIStateProvider>
        </VaultProvider>
      )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <TooltipProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
        <Toaster />
      </TooltipProvider>
    </I18nProvider>
  </StrictMode>,
)
