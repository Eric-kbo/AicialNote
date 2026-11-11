import type { StorageAdapter } from '@aicialnote/storage'
import { GoogleDriveAdapter, LocalFolderAdapter, OneDriveAdapter } from '@aicialnote/storage'
import Dexie from 'dexie'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { type CloudProvider, createTokenProvider, fetchAccount, signIn, signOut } from './data/auth'
import {
  type Connection,
  connectionKey,
  getConnection,
  getFolderHandle,
  setConnection,
  setFolderHandle,
} from './data/db'
import { createDemoStorage } from './data/demo'
import { useI18n } from './i18n'

export type SessionState =
  | { state: 'loading' }
  | { state: 'signedOut'; error?: string }
  | { state: 'resumeLocal'; handle: FileSystemDirectoryHandle }
  | { state: 'ready'; connection: Connection; storage: StorageAdapter }

interface Session {
  session: SessionState
  connectCloud: (p: CloudProvider) => void
  connectLocal: () => Promise<void>
  resumeLocal: () => Promise<void>
  connectDemo: () => Promise<void>
  disconnect: () => Promise<void>
  reauth: () => void
}

const Ctx = createContext<Session | null>(null)

function storageFor(c: Connection, handle?: FileSystemDirectoryHandle): StorageAdapter {
  switch (c.kind) {
    case 'google':
      return new GoogleDriveAdapter(createTokenProvider('google'))
    case 'microsoft':
      return new OneDriveAdapter(createTokenProvider('microsoft'))
    case 'local':
      if (!handle) throw new Error('folder handle missing')
      return new LocalFolderAdapter(handle)
    case 'demo':
      throw new Error('demo storage is async')
  }
}

export const supportsLocalFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window

export function SessionProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n()
  const [session, setSession] = useState<SessionState>({ state: 'loading' })

  const ready = useCallback(
    async (connection: Connection, handle?: FileSystemDirectoryHandle) => {
      await setConnection(connection)
      const storage = connection.kind === 'demo' ? await createDemoStorage(locale) : storageFor(connection, handle)
      // Lets scripts/smoke.mjs inspect what the sync engine wrote to the "drive".
      if (import.meta.env.DEV && connection.kind === 'demo') Object.assign(window, { __aicialnoteDemoStorage: storage })
      setSession({ state: 'ready', connection, storage })
    },
    [locale],
  )

  const booted = useRef(false)
  useEffect(() => {
    // StrictMode runs effects twice; the boot sequence consumes URL params, so run it once.
    if (booted.current) return
    booted.current = true
    void (async () => {
      const params = new URLSearchParams(window.location.search)
      const connected = params.get('connected')
      const authError = params.get('auth_error')
      if (connected || authError) window.history.replaceState(null, '', window.location.pathname)

      if (authError) return setSession({ state: 'signedOut', error: authError })
      if (connected === 'google' || connected === 'microsoft') {
        try {
          const account = await fetchAccount(connected)
          return await ready({ kind: connected, accountId: account.id, email: account.email, name: account.name })
        } catch {
          return setSession({ state: 'signedOut', error: 'expired' })
        }
      }

      const saved = await getConnection()
      if (!saved) return setSession({ state: 'signedOut' })
      if (saved.kind === 'local') {
        const handle = await getFolderHandle()
        if (!handle) return setSession({ state: 'signedOut' })
        const perm = await handle.queryPermission({ mode: 'readwrite' })
        if (perm === 'granted') return await ready(saved, handle)
        return setSession({ state: 'resumeLocal', handle })
      }
      // Cloud: open the local cache right away; the token is fetched lazily.
      await ready(saved)
    })()
    // Run once on boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value: Session = {
    session,
    connectCloud: (p) => signIn(p),
    reauth: () => {
      if (
        session.state === 'ready' &&
        (session.connection.kind === 'google' || session.connection.kind === 'microsoft')
      ) {
        signIn(session.connection.kind, session.connection.email)
      }
    },
    connectLocal: async () => {
      let handle: FileSystemDirectoryHandle
      try {
        handle = await window.showDirectoryPicker({ id: 'aicialnote', mode: 'readwrite' })
      } catch {
        return // user cancelled
      }
      await setFolderHandle(handle)
      await ready({ kind: 'local', folderName: handle.name }, handle)
    },
    resumeLocal: async () => {
      if (session.state !== 'resumeLocal') return
      const perm = await session.handle.requestPermission({ mode: 'readwrite' })
      if (perm === 'granted') await ready({ kind: 'local', folderName: session.handle.name }, session.handle)
    },
    connectDemo: () => ready({ kind: 'demo' }),
    disconnect: async () => {
      if (session.state === 'ready') {
        const c = session.connection
        if (c.kind === 'google' || c.kind === 'microsoft') await signOut(c.kind)
        // The drive is the source of truth; don't leave a plaintext copy behind.
        await Dexie.delete(`aicialnote-vault-${connectionKey(c)}`)
      }
      await setConnection(null)
      setSession({ state: 'signedOut' })
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): Session {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession outside SessionProvider')
  return v
}
