import { fileStrings, pick, resolveLocale } from './i18n'
import { primaryValue } from './item'
import type { Item, VaultMeta } from './schema'

/**
 * Human-readable mirrors of the data. They are regenerated from items/*.json
 * and never read back by the app.
 */

export function readableFileName(item: Item): string {
  const name = item.name
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are invalid in file names
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '')
  return name ? `${item.displayId} ${name}.md` : `${item.displayId}.md`
}

function statusLabel(meta: VaultMeta, id: string) {
  return meta.statuses.find((s) => s.id === id)?.label ?? id
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function itemToMarkdown(item: Item, meta: VaultMeta): string {
  const loc = meta.locale
  const s = (k: keyof typeof fileStrings) => pick(fileStrings[k], loc)
  // Chinese and Japanese use a full-width colon.
  const sep = /^(zh|ja)(-|$)/i.test(loc) ? '：' : ': '
  const lines: string[] = []
  lines.push(`# ${item.displayId}${item.name ? ` · ${item.name}` : ''}`, '')
  const facts = [`${s('status')}${sep}${statusLabel(meta, item.status)}`]
  if (item.tags.length) facts.push(`${s('tags')}${sep}${item.tags.join(', ')}`)
  facts.push(`${s('updated')}${sep}${formatTime(item.updatedAt)}`)
  lines.push(facts.join('　'), '')

  for (const card of item.cards) {
    lines.push(`## ${card.title}`, '')
    for (const field of card.fields) {
      if (!field.value.trim()) continue
      if (field.type === 'multiline' || field.value.includes('\n')) {
        lines.push(`- ${field.label}${sep}`, ...field.value.split('\n').map((l) => `  ${l}`))
      } else {
        lines.push(`- ${field.label}${sep}${field.value}`)
      }
    }
    lines.push('')
  }

  if (item.notes.trim()) lines.push(`## ${s('notes')}`, '', item.notes.trim(), '')
  lines.push('---', '', `<sub>${s('generatedNotice')} \`items/${item.id}.json\`</sub>`, '')
  return lines.join('\n')
}

function csvCell(v: string) {
  return /[",\n\r]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** One row per item, one column per "card · field". UTF-8 with BOM for Excel. */
export function itemsToCsv(items: Item[], meta: VaultMeta): string {
  const loc = meta.locale
  const columns: string[] = []
  const seen = new Set<string>()
  const rows = items.map((item) => {
    const row = new Map<string, string>()
    const cardCount = new Map<string, number>()
    for (const card of item.cards) {
      const n = (cardCount.get(card.title) ?? 0) + 1
      cardCount.set(card.title, n)
      const cardName = n > 1 ? `${card.title} ${n}` : card.title
      const fieldCount = new Map<string, number>()
      for (const field of card.fields) {
        const m = (fieldCount.get(field.label) ?? 0) + 1
        fieldCount.set(field.label, m)
        const key = `${cardName} · ${field.label}${m > 1 ? ` ${m}` : ''}`
        if (!seen.has(key)) {
          seen.add(key)
          columns.push(key)
        }
        row.set(key, field.value)
      }
    }
    return { item, row }
  })

  const head = ['ID', pick(fileStrings.name, loc), pick(fileStrings.status, loc), pick(fileStrings.tags, loc)]
  const tail = [pick(fileStrings.notes, loc), pick(fileStrings.updated, loc)]
  const out = [[...head, ...columns, ...tail].map(csvCell).join(',')]
  for (const { item, row } of rows) {
    out.push(
      [
        item.displayId,
        item.name,
        statusLabel(meta, item.status),
        item.tags.join(' '),
        ...columns.map((c) => row.get(c) ?? ''),
        item.notes,
        formatTime(item.updatedAt),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `﻿${out.join('\r\n')}\r\n`
}

export function buildIndex(items: Item[], now = new Date()) {
  return {
    format: 'aicialnote.index',
    formatVersion: 1,
    generatedAt: now.toISOString(),
    items: items.map((i) => ({
      id: i.id,
      displayId: i.displayId,
      name: i.name,
      status: i.status,
      tags: i.tags,
      primary: primaryValue(i),
      cards: i.cards.map((c) => c.title),
      updatedAt: i.updatedAt,
    })),
  }
}

export function readme(locale: string): string {
  if (resolveLocale(locale) === 'zh') {
    return `# AicialNote 数据文件夹

这个文件夹是 AicialNote 的全部数据。AicialNote 只是读写这里的文件，不在任何服务器上保存你的数据。
即使 AicialNote 不再可用，这里的文件依然完整、可读。

| 路径 | 内容 |
|---|---|
| \`vault.json\` | 设置：状态列表、下一个 ID 编号等 |
| \`items/*.json\` | **数据本体**，每个 ID 一个文件 |
| \`readable/*.md\` | 自动生成的可读版本，可直接打开查看 |
| \`readable/全部账号.csv\` | 自动生成的总表，可用 Excel 打开 |
| \`index.json\` | 自动生成的索引 |
| \`history/<id>/\` | 每次修改前的旧版本 |
| \`trash/\` | 已删除的 ID |

请不要手动修改 \`readable/\` 和 \`index.json\`，它们会被覆盖。
数据格式说明见 AicialNote 源码仓库中的 docs/data-format.md。
`
  }
  return `# AicialNote data folder

This folder holds all of your AicialNote data. AicialNote only reads and writes these files; nothing is stored on any server.
If AicialNote ever goes away, everything here stays complete and readable.

| Path | Contents |
|---|---|
| \`vault.json\` | Settings: statuses, next ID number, … |
| \`items/*.json\` | **The data itself**, one file per ID |
| \`readable/*.md\` | Generated, human-readable copies |
| \`readable/all-items.csv\` | Generated spreadsheet of everything |
| \`index.json\` | Generated index |
| \`history/<id>/\` | Previous versions, saved before every change |
| \`trash/\` | Deleted IDs |

Don't edit \`readable/\` or \`index.json\` by hand — they get regenerated.
Format specification: docs/data-format.md in the AicialNote source repository.
`
}
