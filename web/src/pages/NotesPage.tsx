import { childrenOf, flattenPages, type Note, sectionOf } from '@aicialnote/core'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { BookText, Loader2, Plus } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { rememberPage, useNoteCommands } from '../components/notes/commands'
import { PagesPane } from '../components/notes/PagesPane'
import { Button } from '../components/ui/button'
import { useItem, useMeta, useNoteTree } from '../data/vault'
import { useI18n } from '../i18n'
import { getPrefs } from '../lib/prefs'
import { Detail } from './DetailPage'
import { ListPage } from './ListPage'

// The editor (Tiptap + ProseMirror) is the heaviest part of the app; load it on first use.
const PageEditor = lazy(() => import('../components/notes/PageEditor'))

/** /notes: reopen the last section, or offer to create the first notebook. */
export function NotesHome() {
  const tree = useNoteTree()
  const navigate = useNavigate()
  const target = (() => {
    if (!tree) return undefined
    const last = getPrefs().lastSection
    if (last && tree.byId.get(last)?.kind === 'section') return last
    for (const nb of childrenOf(tree, null)) {
      const s = childrenOf(tree, nb.id).find((n) => n.kind === 'section')
      if (s) return s.id
    }
    return null
  })()

  useEffect(() => {
    if (target) void navigate({ to: '/s/$sectionId', params: { sectionId: target }, replace: true })
  }, [target, navigate])

  if (target !== null) return null
  return <NotesEmpty />
}

function NotesEmpty() {
  const { t } = useI18n()
  const cmd = useNoteCommands()
  return (
    <div className="flex h-full items-start justify-center px-6 pt-[14vh]">
      <div className="w-full max-w-[440px]">
        <span className="mb-6 inline-flex size-10 items-center justify-center rounded-lg bg-surface ring-1 ring-line">
          <BookText className="size-5 text-fg-2" />
        </span>
        <h1 className="text-xl font-semibold tracking-[-0.015em]">{t('nb.empty.title')}</h1>
        <p className="mt-2 text-sm leading-[22px] text-fg-2">{t('nb.empty.body')}</p>
        <Button className="mt-6" variant="primary" onClick={() => void cmd.createNotebook()}>
          <Plus />
          {t('nb.empty.action')}
        </Button>
      </div>
    </div>
  )
}

/** /s/$sectionId: jump to the last-opened (or first) page of the section. */
export function SectionPage() {
  const { sectionId } = useParams({ from: '/s/$sectionId' })
  const tree = useNoteTree()
  const navigate = useNavigate()
  const section = tree?.byId.get(sectionId)
  const pages = tree && section ? flattenPages(tree, section.id) : []
  const last = getPrefs().lastPage[sectionId]
  const target = pages.find((r) => r.page.id === last)?.page.id ?? pages[0]?.page.id

  useEffect(() => {
    if (target) void navigate({ to: '/p/$pageId', params: { pageId: target }, replace: true })
  }, [target, navigate])

  if (!tree) return null
  if (section?.kind !== 'section') return <Missing kind="section" />
  if (target) return null
  return (
    <div className="flex h-full">
      <PagesPane section={section} />
      <div className="flex-1" />
    </div>
  )
}

/** /p/$pageId: page list of its section on the left, the editor on the right. */
export function PagePage() {
  const { pageId } = useParams({ from: '/p/$pageId' })
  const tree = useNoteTree()
  const page = tree?.byId.get(pageId)
  const section = tree && page ? sectionOf(tree, page.id) : undefined

  useEffect(() => {
    if (section && page) rememberPage(section.id, page.id)
  }, [section, page])

  if (!tree) return null
  if (!page || !SECTION_ROWS.has(page.kind) || !section) return <Missing kind="page" />
  return (
    <div className="flex h-full">
      {/* On an account list, "N" belongs to the list (new account), not to the page list. */}
      <PagesPane section={section} activeId={page.id} newPageShortcut={page.kind !== 'accountList'} />
      {page.kind === 'page' && (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-fg-3">
              <Loader2 className="size-5 animate-spin" />
            </div>
          }
        >
          <PageEditor key={page.id} page={page as Note} />
        </Suspense>
      )}
      {page.kind === 'accountList' && <ListPage key={page.id} scope={page} />}
      {page.kind === 'account' && <AccountPane key={page.id} id={page.id} sectionId={section.id} />}
    </div>
  )
}

const SECTION_ROWS = new Set(['page', 'accountList', 'account'])

/** An account inside a notebook: the same detail view as /i/$id, without its own navigation. */
function AccountPane({ id, sectionId }: { id: string; sectionId: string }) {
  const item = useItem(id)
  const meta = useMeta()
  const cmd = useNoteCommands()
  if (!item || !meta) return <div className="flex-1" />
  return (
    <div className="min-w-0 flex-1">
      <Detail item={item} meta={meta} embedded onDeleted={() => cmd.openSection(sectionId)} />
    </div>
  )
}

function Missing({ kind }: { kind: 'page' | 'section' }) {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 pb-24 text-sm text-fg-2">
      {t(kind === 'page' ? 'nb.pageNotFound' : 'nb.sectionNotFound')}
      <Link to="/notes" className="text-accent hover:underline">
        {t('nav.notebooks')}
      </Link>
    </div>
  )
}
