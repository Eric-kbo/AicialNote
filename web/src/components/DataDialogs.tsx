import {
  createBackup,
  type ImportSource,
  itemsToCsv,
  mergeSources,
  parseImport,
  planImport,
  planIsEmpty,
  serialize,
  UnsupportedVersionError,
} from '@aicialnote/core'
import { FileJson, FileSpreadsheet, History, KeyRound, Upload } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useItems, useMeta, useNotes, useVault } from '../data/vault'
import { type MessageKey, useI18n } from '../i18n'
import { downloadText, fileDate } from '../lib/download'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { toast } from './ui/toast'
import { useUI } from './ui-state'

export function DataDialogs() {
  const { dataDialog, setDataDialog } = useUI()
  const close = () => setDataDialog(null)
  return (
    <>
      <ExportDialog open={dataDialog === 'export'} onClose={close} />
      <ImportDialog open={dataDialog === 'import'} onClose={close} />
    </>
  )
}

// --- export --------------------------------------------------------------------

type ExportKind = 'json' | 'csv'

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { actions } = useVault()
  const items = useItems()
  const notes = useNotes()
  const [kind, setKind] = useState<ExportKind>('json')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setKind('json')
  }, [open])

  const run = async () => {
    setBusy(true)
    try {
      const snap = await actions.snapshot()
      const name = kind === 'json' ? `AicialNote-backup-${fileDate()}.json` : `AicialNote-accounts-${fileDate()}.csv`
      if (kind === 'json') downloadText(name, serialize(createBackup(snap)), 'application/json')
      else {
        const sorted = [...snap.items].sort((a, b) => a.displayId.localeCompare(b.displayId))
        downloadText(name, itemsToCsv(sorted, snap.meta), 'text/csv')
      }
      toast(t('data.export.done', { name }))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('data.export.title')}
      className="max-w-[480px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={busy || !items} onClick={() => void run()} data-export-run>
            {t('data.export.action')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t('data.export.title')}</legend>
          <ChoiceCard
            selected={kind === 'json'}
            onSelect={() => setKind('json')}
            icon={<FileJson />}
            title={t('data.export.json')}
            hint={t('data.export.jsonHint')}
          />
          <ChoiceCard
            selected={kind === 'csv'}
            onSelect={() => setKind('csv')}
            icon={<FileSpreadsheet />}
            title={t('data.export.csv')}
            hint={t('data.export.csvHint')}
          />
        </fieldset>
        <p className="text-xs text-fg-3 tabular-nums">
          {kind === 'json'
            ? t('data.export.countAll', { items: items?.length ?? 0, notes: notes?.length ?? 0 })
            : t('data.export.countItems', { items: items?.length ?? 0 })}
        </p>
        <Notice icon={<KeyRound />}>{t('data.export.warning')}</Notice>
      </div>
    </Dialog>
  )
}

function ChoiceCard(props: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; hint: string }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors duration-100',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
        '[&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
        props.selected
          ? 'border-accent bg-accent-soft [&>svg]:text-accent'
          : 'border-line hover:border-line-strong hover:bg-hover [&>svg]:text-fg-3',
      )}
    >
      <input type="radio" name="export-kind" className="sr-only" checked={props.selected} onChange={props.onSelect} />
      {props.icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{props.title}</span>
        <span className="mt-0.5 block text-xs leading-[18px] text-fg-2">{props.hint}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
          props.selected ? 'border-accent' : 'border-line-strong',
        )}
      >
        {props.selected && <span className="size-2 rounded-full bg-accent" />}
      </span>
    </label>
  )
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-subtle px-3 py-2.5 text-xs leading-[18px] text-fg-2 [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-fg-3">
      {icon}
      <p>{children}</p>
    </div>
  )
}

// --- import --------------------------------------------------------------------

interface Picked {
  files: string[]
  source: ImportSource
  errors: Array<{ name: string; key: MessageKey }>
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { actions } = useVault()
  const items = useItems()
  const notes = useNotes()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLButtonElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setPicked(null)
  }, [open])

  const read = async (list: FileList | File[]) => {
    const files = [...list]
    if (!files.length) return
    const sources: ImportSource[] = []
    const errors: Picked['errors'] = []
    for (const file of files) {
      try {
        sources.push(parseImport(await file.text()))
      } catch (err) {
        errors.push({
          name: file.name,
          key: err instanceof UnsupportedVersionError ? 'data.import.errorNewer' : 'data.import.errorFormat',
        })
      }
    }
    setPicked({ files: files.map((f) => f.name), source: mergeSources(sources), errors })
  }

  // Recomputed from the live cache, so a sync that lands while the dialog is
  // open is taken into account.
  const meta = useMeta()
  const plan = picked && items && notes && meta ? planImport({ items, notes, meta }, picked.source) : null

  const run = async () => {
    if (!picked) return
    setBusy(true)
    try {
      const snap = await actions.snapshot()
      const fresh = planImport(snap, picked.source)
      await actions.applyImport(fresh)
      const n = fresh.addItems.length + fresh.updateItems.length + fresh.addNotes.length + fresh.updateNotes.length
      toast(t('data.import.done', { n }))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('data.import.title')}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        dropRef.current?.focus()
      }}
      className="max-w-[480px]"
      footer={
        <>
          {picked && (
            <Button variant="ghost" className="mr-auto" onClick={() => inputRef.current?.click()}>
              {t('data.import.again')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !plan || planIsEmpty(plan)}
            onClick={() => void run()}
            data-import-run
          >
            {t('data.import.action')}
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        multiple
        hidden
        data-import-input
        onChange={(e) => {
          if (e.target.files) void read(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex flex-col gap-4 p-4">
        {!picked ? (
          <button
            ref={dropRef}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void read(e.dataTransfer.files)
            }}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors duration-100',
              dragging ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-hover',
            )}
          >
            <Upload className="size-5 text-fg-3" />
            <span className="text-sm font-medium text-fg">{t('data.import.pick')}</span>
            <span className="max-w-[340px] text-xs leading-[18px] text-fg-3">{t('data.import.pickHint')}</span>
          </button>
        ) : (
          <div>
            <p className="truncate text-xs text-fg-3" title={picked.files.join('\n')}>
              {picked.files.length === 1 ? picked.files[0] : t('data.import.files', { n: picked.files.length })}
            </p>
            {plan && (
              <dl className="mt-2 divide-y divide-line rounded-lg border border-line" data-import-summary>
                <SummaryRow label={t('data.import.addItems')} n={plan.addItems.length} />
                <SummaryRow label={t('data.import.updateItems')} n={plan.updateItems.length} />
                <SummaryRow label={t('data.import.addNotes')} n={plan.addNotes.length} />
                <SummaryRow label={t('data.import.updateNotes')} n={plan.updateNotes.length} />
                <SummaryRow label={t('data.import.skipped')} n={plan.skipped} muted />
                {plan.invalid > 0 && <SummaryRow label={t('data.import.invalid')} n={plan.invalid} muted />}
              </dl>
            )}
            {picked.errors.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-xs text-st-red">
                {picked.errors.map((e) => (
                  <li key={e.name} className="truncate">
                    {t(e.key, { name: e.name })}
                  </li>
                ))}
              </ul>
            )}
            {plan && planIsEmpty(plan) && picked.errors.length < picked.files.length && (
              <p className="mt-3 text-xs text-fg-2">{t('data.import.nothing')}</p>
            )}
          </div>
        )}
        <Notice icon={<History />}>{t('data.import.rules')}</Notice>
      </div>
    </Dialog>
  )
}

function SummaryRow({ label, n, muted }: { label: string; n: number; muted?: boolean }) {
  return (
    <div className="flex h-9 items-center justify-between px-3 text-sm">
      <dt className={muted ? 'text-fg-3' : 'text-fg-2'}>{label}</dt>
      <dd className={cn('tabular-nums', muted || n === 0 ? 'text-fg-3' : 'font-medium text-fg')}>{n}</dd>
    </div>
  )
}
