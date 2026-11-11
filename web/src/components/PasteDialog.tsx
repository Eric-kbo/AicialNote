import {
  type Card,
  entryToCard,
  guessName,
  guessTemplate,
  type Item,
  orderAtEnd,
  orderBetween,
  type ParsedEntry,
  parsePaste,
  pick,
  TEMPLATES,
} from '@aicialnote/core'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, FileText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNoteTree, useVault } from '../data/vault'
import { useI18n } from '../i18n'
import { useHotkey } from '../lib/hotkeys'
import { cn, modKey } from '../lib/utils'
import { TemplateIcon } from './icons'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Kbd } from './ui/kbd'
import { Menu, MenuContent, MenuItem, MenuTrigger } from './ui/menu'
import { toast } from './ui/toast'
import { useUI } from './ui-state'

export function PasteDialog() {
  const { paste, closePaste } = useUI()
  return paste ? (
    <PasteDialogBody
      initialText={paste.text ?? ''}
      targetItemId={paste.targetItemId}
      targetListId={paste.targetListId}
      onClose={closePaste}
    />
  ) : null
}

function PasteDialogBody(props: {
  initialText: string
  targetItemId?: string
  targetListId?: string
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const { actions } = useVault()
  const tree = useNoteTree()
  const navigate = useNavigate()
  const [text, setText] = useState(props.initialText)
  const [template, setTemplate] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  const result = useMemo(() => parsePaste(text), [text])
  const single = result.mode === 'single' ? result.entries[0] : undefined
  const isBulk = result.mode === 'bulk' && !props.targetItemId
  const entries = isBulk ? result.entries : single ? [single] : []
  const templateFor = (e: ParsedEntry) => template ?? guessTemplate(e)

  const previewCard = useMemo(
    () => (single ? entryToCard(single, templateFor(single), locale) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [single, template, locale],
  )

  useEffect(() => {
    const el = textarea.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [])

  const canSubmit = text.trim().length > 0

  const submit = async () => {
    if (!canSubmit) return
    if (props.targetItemId && single) {
      const card = entryToCard(single, templateFor(single), locale)
      await actions.updateItem(props.targetItemId, (d) => {
        if (card.fields.length) d.cards.push(card)
        if (single.rest) d.notes = d.notes.trim() ? `${d.notes.trim()}\n\n${single.rest}` : single.rest
      })
      props.onClose()
      return
    }
    // Pasting into an account list files every new item there, in paste order.
    const listId = props.targetListId
    let order = listId && tree ? orderAtEnd(tree, listId) : null
    const builders = entries.map((entry) => (item: Item) => {
      const card = entryToCard(entry, templateFor(entry), locale)
      item.name = (isBulk ? guessName(entry) : (name ?? guessName(entry))).trim()
      if (card.fields.length) item.cards.push(card)
      item.notes = entry.rest
      if (listId && order) {
        item.location = { parentId: listId, order }
        order = orderBetween(order, null)
      }
    })
    const created = await actions.createItems(builders)
    props.onClose()
    if (created.length === 1)
      void navigate(
        listId
          ? { to: '/p/$pageId', params: { pageId: created[0]!.id } }
          : { to: '/i/$id', params: { id: created[0]!.id } },
      )
    else toast(t('paste.created', { n: created.length }))
  }

  useHotkey('mod+enter', () => void submit())

  const title = props.targetItemId ? t('paste.titleCard') : t('paste.title')
  const submitLabel = props.targetItemId
    ? t('paste.addCard')
    : isBulk
      ? t('paste.createN', { n: entries.length })
      : t('paste.create')

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      title={title}
      className="max-w-[920px]"
      onOpenAutoFocus={(e) => e.preventDefault()}
      footer={
        <>
          <span className="mr-auto text-xs text-fg-3">
            {isBulk ? t('paste.bulk', { n: entries.length }) : single?.rest ? t('paste.unrecognized') : ''}
          </span>
          <Button variant="ghost" onClick={props.onClose}>
            {t('paste.cancel')}
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {submitLabel}
            <Kbd tone="inverse">{`${modKey}+Enter`}</Kbd>
          </Button>
        </>
      }
    >
      <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-[1fr_minmax(0,400px)]">
        <div className="flex flex-col border-line p-4 md:border-r">
          <textarea
            ref={textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={t('paste.placeholder')}
            className="min-h-[360px] flex-1 resize-none bg-transparent font-mono text-[13px] leading-[21px] outline-none placeholder:font-sans placeholder:leading-[22px]"
          />
        </div>

        <div className="flex min-w-0 flex-col bg-subtle/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-fg-3 uppercase">{t('paste.preview')}</span>
            {entries.length > 0 && (
              <TemplatePicker
                value={template ?? (single ? guessTemplate(single) : null)}
                mixed={isBulk && !template}
                onChange={setTemplate}
              />
            )}
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-fg-3">
              <FileText className="size-5" />
              {t('paste.nothing')}
            </div>
          ) : isBulk ? (
            <BulkPreview entries={entries} templateFor={templateFor} />
          ) : (
            <div className="flex flex-col gap-3">
              {!props.targetItemId && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-fg-3">{t('paste.name')}</span>
                  <input
                    value={name ?? guessName(single!)}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('detail.namePlaceholder')}
                    className="h-8 rounded-md border border-line bg-surface px-2.5 text-sm outline-none focus:border-accent"
                  />
                </label>
              )}
              {previewCard && <CardPreview card={previewCard} />}
              {single?.values.length === 0 && <p className="text-xs text-fg-3">{t('paste.noValues')}</p>}
              {single?.rest && (
                <div className="rounded-lg border border-dashed border-line-strong p-2.5">
                  <div className="mb-1 text-xs text-fg-3">{t('detail.notes')}</div>
                  <p className="line-clamp-4 text-xs whitespace-pre-wrap text-fg-2">{single.rest}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function TemplatePicker(props: { value: string | null; mixed: boolean; onChange: (id: string) => void }) {
  const { t, locale } = useI18n()
  const current = TEMPLATES.find((x) => x.id === props.value)
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface pr-1.5 pl-1 text-sm hover:border-line-strong data-[state=open]:border-line-strong"
        >
          {props.mixed || !current ? (
            <span className="px-1 text-fg-2">{t('paste.template')}</span>
          ) : (
            <>
              <TemplateIcon template={current.id} size="sm" />
              {pick(current.name, locale)}
            </>
          )}
          <ChevronDown className="size-3.5 text-fg-3" />
        </button>
      </MenuTrigger>
      <MenuContent>
        {TEMPLATES.map((tpl) => (
          <MenuItem
            key={tpl.id}
            icon={<TemplateIcon template={tpl.id} size="sm" />}
            onSelect={() => props.onChange(tpl.id)}
          >
            {pick(tpl.name, locale)}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

function CardPreview({ card }: { card: Card }) {
  const t = useI18n().t
  const filled = card.fields.filter((f) => f.value)
  const empty = card.fields.length - filled.length
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-sm font-medium">
        <TemplateIcon template={card.template} size="sm" />
        {card.title}
      </div>
      <dl className="divide-y divide-line">
        {filled.map((f) => (
          <div key={f.id} className="grid grid-cols-[92px_1fr] items-center gap-3 px-3 py-1.5 text-sm">
            <dt className="truncate text-fg-3">{f.label}</dt>
            <dd className="truncate font-mono text-[12.5px]">
              {f.type === 'password' ? '•'.repeat(Math.min(12, f.value.length)) : f.value}
            </dd>
          </div>
        ))}
        {empty > 0 && (
          <div className="px-3 py-1.5 text-xs text-fg-3">
            +{empty} {t('field.empty')}
          </div>
        )}
      </dl>
    </div>
  )
}

function BulkPreview(props: { entries: ParsedEntry[]; templateFor: (e: ParsedEntry) => string }) {
  const { t } = useI18n()
  const get = (e: ParsedEntry, role: string) => e.values.find((v) => v.role === role)?.value ?? ''
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface">
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 bg-surface text-left text-xs text-fg-3">
          <tr className="border-b border-line">
            <th className="w-9 py-1.5 pl-3 font-normal">#</th>
            <th className="py-1.5 font-normal">{t('role.account')}</th>
            <th className="w-[92px] py-1.5 font-normal">{t('role.password')}</th>
            <th className="w-12 py-1.5 pr-3 text-right font-normal">+</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {props.entries.map((e, i) => {
            const account = get(e, 'account') || get(e, 'host') || get(e, 'username')
            const extra =
              e.values.length -
              [get(e, 'account') || get(e, 'host') || get(e, 'username'), get(e, 'password')].filter(Boolean).length
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: preview rows have no identity
              <tr key={i}>
                <td className="py-1.5 pl-3 text-xs text-fg-3 tnum">{i + 1}</td>
                <td className="py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <TemplateIcon template={props.templateFor(e)} size="sm" />
                    <span className={cn('truncate font-mono text-[12.5px]', !account && 'text-fg-3')}>
                      {account || '—'}
                    </span>
                  </span>
                </td>
                <td className="py-1.5 font-mono text-[12.5px] text-fg-2">{get(e, 'password') ? '••••••' : '—'}</td>
                <td className="py-1.5 pr-3 text-right text-xs text-fg-3 tnum">{extra > 0 ? `+${extra}` : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
