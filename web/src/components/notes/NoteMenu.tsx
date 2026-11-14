import { NOTE_COLORS, type Note } from '@aicialnote/core'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  FilePlus,
  FolderMinus,
  FolderPlus,
  KeyRound,
  MoreHorizontal,
  Palette,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { IconButton } from '../ui/button'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '../ui/menu'
import { requestNameFocus } from '../ui-state'
import { requestTitleFocus, startRename, useNoteCommands } from './commands'
import { ColorSwatch } from './NoteIcon'

const DELETE_LABEL = {
  notebook: 'nb.deleteNotebook',
  section: 'nb.deleteSection',
  page: 'nb.deletePage',
  accountList: 'nb.deleteList',
  account: 'nb.deleteAccount',
} as const

/**
 * The "…" menu of a notebook, section or page row. `open`/`onOpenChange` let
 * a right-click on the row open the same menu.
 */
export function NoteMenu(props: {
  note: Note
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
  /** Pages only. */
  canIndent?: boolean
  canOutdent?: boolean
}) {
  const { note } = props
  const { t } = useI18n()
  const cmd = useNoteCommands()
  const sectionId = note.kind === 'section' ? note.id : undefined
  /** Rows of the page list (named in the right-hand column) vs. sidebar rows (renamed in place). */
  const inPane = note.kind === 'page' || note.kind === 'accountList' || note.kind === 'account'

  return (
    <Menu open={props.open} onOpenChange={props.onOpenChange} modal={false}>
      <MenuTrigger asChild>
        <IconButton
          label={t('nb.more')}
          tooltip={false}
          size="xs"
          className={cn('opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100', props.className)}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        {note.kind === 'notebook' && (
          <MenuItem icon={<FolderPlus />} onSelect={() => void cmd.createSection(note.id)}>
            {t('nb.newSection')}
          </MenuItem>
        )}
        {sectionId && (
          <>
            <MenuItem icon={<FilePlus />} onSelect={() => void cmd.createPage({ sectionId })}>
              {t('nb.newPage')}
            </MenuItem>
            <MenuItem icon={<KeyRound />} onSelect={() => void cmd.createAccount(sectionId)}>
              {t('nb.newAccount')}
            </MenuItem>
            <MenuItem icon={<Users />} onSelect={() => void cmd.createAccountList(sectionId)}>
              {t('nb.newAccountList')}
            </MenuItem>
          </>
        )}
        {note.kind === 'accountList' && (
          <MenuItem icon={<KeyRound />} onSelect={() => void cmd.createAccount(note.id)}>
            {t('nb.newAccount')}
          </MenuItem>
        )}
        {note.kind === 'page' && <PageItems note={note} canIndent={props.canIndent} canOutdent={props.canOutdent} />}
        {note.kind === 'account' && (
          <>
            <MenuItem
              icon={<ArrowRightToLine />}
              shortcut="Tab"
              disabled={!props.canIndent}
              onSelect={() => void cmd.indent(note.id)}
            >
              {t('nb.indentAccount')}
            </MenuItem>
            <MenuItem
              icon={<ArrowLeftToLine />}
              shortcut="⇧Tab"
              disabled={!props.canOutdent}
              onSelect={() => void cmd.outdent(note.id)}
            >
              {t('nb.outdentAccount')}
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuItem
          icon={<Pencil />}
          shortcut={inPane ? undefined : 'F2'}
          onSelect={() => {
            if (!inPane) return startRename(note.id)
            // Pages, lists and accounts are named in the right-hand column.
            const selector = note.kind === 'account' ? '[data-item-name]' : '[data-page-title]'
            if (note.kind === 'account') requestNameFocus(note.id)
            else requestTitleFocus(note.id)
            cmd.openPage(note.id)
            setTimeout(() => {
              const el = document.querySelector<HTMLInputElement>(selector)
              el?.focus()
              el?.select()
            }, 50)
          }}
        >
          {t('nb.rename')}
        </MenuItem>
        {note.kind === 'account' && (
          <MenuItem icon={<FolderMinus />} onSelect={() => void cmd.unfile(note)}>
            {t('nb.unfile')}
          </MenuItem>
        )}
        {!inPane && (
          <MenuSub>
            <MenuSubTrigger icon={<Palette />}>{t('nb.color')}</MenuSubTrigger>
            <MenuSubContent>
              <MenuRadioGroup
                value={note.color ?? 'gray'}
                onValueChange={(c) => cmd.setColor(note.id, c as Note['color'] & string)}
              >
                {NOTE_COLORS.map((c) => (
                  <MenuRadioItem key={c} value={c} icon={<ColorSwatch color={c} className="mx-0.5" />}>
                    {t(`nb.color.${c}`)}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuSubContent>
          </MenuSub>
        )}
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} danger onSelect={() => void cmd.remove(note)}>
          {t(DELETE_LABEL[note.kind])}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function PageItems(props: { note: Note; canIndent?: boolean; canOutdent?: boolean }) {
  const { t } = useI18n()
  const cmd = useNoteCommands()
  const section = props.note.parentId
  if (!cmd.tree || !section) return null
  const sectionId = cmd.tree.byId.get(section)?.kind === 'section' ? section : undefined
  return (
    <>
      <MenuItem
        icon={<FilePlus />}
        onSelect={() => {
          const tree = cmd.tree!
          let s = props.note.parentId
          while (s && tree.byId.get(s)?.kind === 'page') s = tree.byId.get(s)!.parentId
          if (s) void cmd.createPage({ sectionId: s, parentPageId: props.note.id })
        }}
      >
        {t('nb.newSubpage')}
      </MenuItem>
      <MenuItem
        icon={<ArrowRightToLine />}
        shortcut="Tab"
        disabled={!props.canIndent}
        onSelect={() => void cmd.indent(props.note.id)}
      >
        {t('nb.indent')}
      </MenuItem>
      <MenuItem
        icon={<ArrowLeftToLine />}
        shortcut="⇧Tab"
        disabled={!props.canOutdent || Boolean(sectionId)}
        onSelect={() => void cmd.outdent(props.note.id)}
      >
        {t('nb.outdent')}
      </MenuItem>
      <MenuSeparator />
    </>
  )
}
