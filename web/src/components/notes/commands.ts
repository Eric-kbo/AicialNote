import {
  type DropPosition,
  type Note,
  type NoteColor,
  orderAfter,
  orderAtEnd,
  planIndent,
  planMove,
  planOutdent,
} from '@aicialnote/core'
import { useNavigate } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { useNoteTree, useVault } from '../../data/vault'
import { useI18n } from '../../i18n'
import { getPrefs, setPrefs, toggleIn } from '../../lib/prefs'
import { toast } from '../ui/toast'
import { requestNameFocus } from '../ui-state'

// --- which row is being renamed (one at a time, app-wide) ---------------------

let renaming: string | null = null
const listeners = new Set<() => void>()
export function startRename(id: string | null) {
  renaming = id
  for (const l of listeners) l()
}
export function useRenaming(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => renaming,
  )
}

/** One-shot: focus the title of this page when its editor mounts. */
let focusTitleFor: string | null = null
export function requestTitleFocus(id: string) {
  focusTitleFor = id
}
export function consumeTitleFocus(id: string) {
  if (focusTitleFor !== id) return false
  focusTitleFor = null
  return true
}

export function noteTitle(note: Note, t: ReturnType<typeof useI18n>['t']): string {
  if (note.title.trim()) return note.title
  const untitled = {
    notebook: 'nb.untitledNotebook',
    section: 'nb.untitledSection',
    page: 'nb.untitledPage',
    accountList: 'nb.untitledList',
    account: 'list.untitled',
  } as const
  return t(untitled[note.kind])
}

export function useNoteCommands() {
  const { actions } = useVault()
  const tree = useNoteTree()
  const navigate = useNavigate()
  const { t } = useI18n()

  const openPage = (id: string) => void navigate({ to: '/p/$pageId', params: { pageId: id } })
  const openSection = (id: string) => void navigate({ to: '/s/$sectionId', params: { sectionId: id } })

  /** Writes a planned move: accounts move by their item's location, everything else by its note file. */
  const apply = async (id: string, plan: { parentId: string | null; order: string }) => {
    if (tree?.byId.get(id)?.kind === 'account') {
      if (plan.parentId) await actions.placeItem(id, { parentId: plan.parentId, order: plan.order })
      return
    }
    await actions.updateNote(id, (d) => {
      d.parentId = plan.parentId
      d.order = plan.order
    })
  }

  return {
    tree,
    openPage,
    openSection,

    /** Notebook + first section + first page, then rename the notebook. */
    async createNotebook() {
      if (!tree) return
      const nb = await actions.createNote({
        kind: 'notebook',
        parentId: null,
        order: orderAtEnd(tree, null),
        title: t('nb.defaultNotebook'),
        color: 'blue',
      })
      const section = await actions.createNote({
        kind: 'section',
        parentId: nb.id,
        order: 'a0',
        title: t('nb.defaultSection'),
        color: 'blue',
      })
      const page = await actions.createNote({ kind: 'page', parentId: section.id, order: 'a0' })
      setPrefs((p) => ({ ...p, closedNotebooks: toggleIn(p.closedNotebooks, nb.id, false) }))
      openPage(page.id)
      startRename(nb.id)
    },

    async createSection(notebookId: string) {
      if (!tree) return
      const colors: NoteColor[] = ['blue', 'green', 'yellow', 'purple', 'red', 'gray']
      const count = tree.children.get(notebookId)?.length ?? 0
      const section = await actions.createNote({
        kind: 'section',
        parentId: notebookId,
        order: orderAtEnd(tree, notebookId),
        title: t('nb.untitledSection'),
        color: colors[count % colors.length],
      })
      setPrefs((p) => ({ ...p, closedNotebooks: toggleIn(p.closedNotebooks, notebookId, false) }))
      openSection(section.id)
      startRename(section.id)
    },

    /** New page at the end of a section, or right after `afterId`, or as a subpage of `parentPageId`. */
    async createPage(opts: { sectionId: string; afterId?: string; parentPageId?: string }) {
      if (!tree) return
      const parentId = opts.parentPageId ?? opts.sectionId
      const order = opts.afterId ? orderAfter(tree, opts.afterId) : orderAtEnd(tree, parentId)
      const page = await actions.createNote({ kind: 'page', parentId, order })
      if (opts.parentPageId) setPrefs((p) => ({ ...p, collapsedPages: toggleIn(p.collapsedPages, parentId, false) }))
      requestTitleFocus(page.id)
      openPage(page.id)
      return page
    },

    /** New account at the end of a section or an account list; opens it with the name focused. */
    async createAccount(parentId: string) {
      if (!tree) return
      const [item] = await actions.createItems([
        (d) => {
          d.location = { parentId, order: orderAtEnd(tree, parentId) }
        },
      ])
      if (tree.byId.get(parentId)?.kind === 'accountList')
        setPrefs((p) => ({ ...p, collapsedPages: toggleIn(p.collapsedPages, parentId, false) }))
      requestNameFocus(item!.id)
      openPage(item!.id)
    },

    async createAccountList(sectionId: string) {
      if (!tree) return
      const list = await actions.createNote({
        kind: 'accountList',
        parentId: sectionId,
        order: orderAtEnd(tree, sectionId),
        title: t('nb.defaultList'),
      })
      requestTitleFocus(list.id)
      openPage(list.id)
    },

    async remove(note: Note) {
      const name = noteTitle(note, t)
      if (note.kind === 'account') {
        const deleted = await actions.deleteItem(note.id)
        if (deleted)
          toast(t('detail.deleted', { id: deleted.displayId }), {
            action: { label: t('common.undo'), onClick: () => void actions.restoreItem(deleted) },
          })
        return
      }
      const removed = await actions.deleteNote(note.id)
      if (!removed.notes.length) return
      const n = removed.notes.length - 1
      const message = removed.unfiled.length
        ? t('nb.deletedUnfiled', { name, n: removed.unfiled.length })
        : n > 0
          ? t('nb.deletedN', { name, n })
          : t('nb.deleted', { name })
      toast(message, {
        action: { label: t('common.undo'), onClick: () => void actions.restoreNotes(removed) },
        duration: removed.unfiled.length ? 9000 : undefined,
      })
    },

    /** Takes an account out of the notebooks; it stays in the account list as "unfiled". */
    async unfile(note: Note) {
      const item = tree?.items.get(note.id)
      if (!item?.location) return
      const location = item.location
      await actions.placeItem(note.id, null)
      toast(t('nb.unfiled', { name: noteTitle(note, t) }), {
        action: { label: t('common.undo'), onClick: () => void actions.placeItem(note.id, location) },
      })
    },

    async move(id: string, targetId: string, position: DropPosition) {
      if (!tree) return
      const plan = planMove(tree, id, targetId, position)
      if (!plan) return
      await apply(id, plan)
      if (position === 'inside') {
        const target = tree.byId.get(targetId)
        if (target?.kind === 'notebook')
          setPrefs((p) => ({ ...p, closedNotebooks: toggleIn(p.closedNotebooks, targetId, false) }))
        if (target?.kind === 'page' || target?.kind === 'accountList')
          setPrefs((p) => ({ ...p, collapsedPages: toggleIn(p.collapsedPages, targetId, false) }))
      }
    },

    async indent(id: string) {
      if (!tree) return
      const plan = planIndent(tree, id)
      if (!plan) return
      if (plan.parentId) setPrefs((p) => ({ ...p, collapsedPages: toggleIn(p.collapsedPages, plan.parentId!, false) }))
      await apply(id, plan)
    },

    async outdent(id: string) {
      if (!tree) return
      const plan = planOutdent(tree, id)
      if (!plan) return
      await apply(id, plan)
    },

    rename(id: string, title: string) {
      void actions.updateNote(id, (d) => {
        d.title = title
      })
    },

    setColor(id: string, color: NoteColor) {
      void actions.updateNote(id, (d) => {
        d.color = color
      })
    },
  }
}

export function rememberPage(sectionId: string, pageId: string) {
  const p = getPrefs()
  if (p.lastPage[sectionId] === pageId && p.lastSection === sectionId) return
  setPrefs((prev) => ({ ...prev, lastSection: sectionId, lastPage: { ...prev.lastPage, [sectionId]: pageId } }))
}
