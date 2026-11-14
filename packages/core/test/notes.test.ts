import { MemoryAdapter } from '@aicialnote/storage'
import { describe, expect, it } from 'vitest'
import {
  ancestors,
  buildTree,
  createNote,
  docToMarkdown,
  docToText,
  flattenPages,
  isWithin,
  type Note,
  type NoteDoc,
  noteSearchText,
  orderBetween,
  pageDepth,
  pageHeight,
  parseNote,
  sectionOf,
  subtree,
} from '../src/notes'
import { paths, VaultRemote } from '../src/remote'
import { serialize } from '../src/schema'

function sample() {
  const nb = createNote({ kind: 'notebook', parentId: null, order: 'a0', title: 'Work' })
  const sec = createNote({ kind: 'section', parentId: nb.id, order: 'a0', title: 'Proxies' })
  const p1 = createNote({ kind: 'page', parentId: sec.id, order: 'a1', title: 'Second' })
  const p0 = createNote({ kind: 'page', parentId: sec.id, order: 'a0', title: 'First' })
  const sub = createNote({ kind: 'page', parentId: p0.id, order: 'a0', title: 'Child' })
  const subsub = createNote({ kind: 'page', parentId: sub.id, order: 'a0', title: 'Grandchild' })
  return { nb, sec, p0, p1, sub, subsub, all: [nb, sec, p1, p0, sub, subsub] as Note[] }
}

describe('note tree', () => {
  it('orders siblings and flattens pages with depth', () => {
    const s = sample()
    const tree = buildTree(s.all)
    const rows = flattenPages(tree, s.sec.id)
    expect(rows.map((r) => [r.page.title, r.depth, r.hasChildren])).toEqual([
      ['First', 0, true],
      ['Child', 1, true],
      ['Grandchild', 2, false],
      ['Second', 0, false],
    ])
    expect(flattenPages(tree, s.sec.id, new Set([s.p0.id])).map((r) => r.page.title)).toEqual(['First', 'Second'])
  })

  it('walks ancestors, sections, depth and subtrees', () => {
    const s = sample()
    const tree = buildTree(s.all)
    expect(ancestors(tree, s.subsub.id).map((n) => n.title)).toEqual(['Work', 'Proxies', 'First', 'Child'])
    expect(sectionOf(tree, s.subsub.id)?.id).toBe(s.sec.id)
    expect(pageDepth(tree, s.subsub.id)).toBe(3)
    expect(pageHeight(tree, s.p0.id)).toBe(2)
    expect(subtree(tree, s.p0.id).map((n) => n.title)).toEqual(['First', 'Child', 'Grandchild'])
    expect(isWithin(tree, s.subsub.id, s.p0.id)).toBe(true)
    expect(isWithin(tree, s.p1.id, s.p0.id)).toBe(false)
  })

  it('generates order keys between neighbours, even for equal keys', () => {
    const a = orderBetween(null, null)
    const b = orderBetween(a, null)
    const mid = orderBetween(a, b)
    expect(a < mid && mid < b).toBe(true)
    expect(orderBetween(null, a) < a).toBe(true)
    expect(() => orderBetween(b, b)).not.toThrow()
  })

  it('survives a round trip and keeps unknown keys', () => {
    const s = sample()
    const text = serialize({ ...s.p0, futureKey: { x: 1 } })
    const parsed = parseNote(text)
    expect(parsed.title).toBe('First')
    expect((parsed as Record<string, unknown>).futureKey).toEqual({ x: 1 })
    expect(() => parseNote(serialize({ ...s.p0, formatVersion: 99 }))).toThrow(/newer/)
  })
})

const doc: NoteDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Setup' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Use ' },
        { type: 'text', text: 'this', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }] },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
        },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'IP' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Port' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1.2.3.4' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '8080' }] }] },
          ],
        },
      ],
    },
  ],
}

describe('page text', () => {
  it('renders Markdown', () => {
    expect(docToMarkdown(doc)).toBe(
      [
        '## Setup',
        'Use **this**[ link](https://example.com)',
        '- one\n  - nested',
        '- [x] done',
        '| IP | Port |\n| --- | --- |\n| 1.2.3.4 | 8080 |',
      ].join('\n\n'),
    )
  })

  it('extracts plain text for search', () => {
    expect(docToText(doc)).toContain('Use this link')
    expect(docToText(doc)).toContain('1.2.3.4')
    const page = createNote({ kind: 'page', parentId: 'x', order: 'a0', title: 'Proxy List', content: doc })
    expect(noteSearchText(page)).toContain('proxy list\n')
    expect(noteSearchText(page)).toContain('nested')
  })
})

describe('VaultRemote notes', () => {
  it('keeps history on overwrite and a trash copy on delete', async () => {
    const storage = new MemoryAdapter()
    const remote = new VaultRemote(storage)
    const { p0 } = sample()
    const etag = await remote.writeNote(p0, { etag: null })
    const first = (await storage.read(paths.note(p0.id)))!.text
    await remote.writeNote({ ...p0, title: 'Renamed' }, { etag, previous: first })
    const history = storage.paths().filter((p) => p.startsWith(`history/${p0.id}/`))
    expect(history).toHaveLength(1)
    expect((await remote.listNotes()).map((f) => f.id)).toEqual([p0.id])
    expect((await remote.readNote(p0.id))?.note.title).toBe('Renamed')

    const md = await remote.writeNoteReadable(p0, ['Work', 'Proxies'], 'zh')
    expect(md.startsWith('readable/笔记/First (')).toBe(true)
    expect((await storage.read(md))?.text).toContain('Work / Proxies')

    await remote.trashNote(p0)
    expect(await remote.readNote(p0.id)).toBeNull()
    expect(storage.paths()).toContain(`trash/${p0.id}.json`)
  })
})

describe('moves', () => {
  it('reorders, nests and refuses invalid moves', async () => {
    const { planIndent, planMove, planOutdent } = await import('../src/notes')
    const s = sample()
    const tree = buildTree(s.all)
    // Second before First
    const m = planMove(tree, s.p1.id, s.p0.id, 'before')!
    expect(m.parentId).toBe(s.sec.id)
    expect(m.order < s.p0.order).toBe(true)
    // into its own subtree
    expect(planMove(tree, s.p0.id, s.subsub.id, 'inside')).toBeNull()
    // a page can't become a section sibling, a section can't go under a page
    expect(planMove(tree, s.p1.id, s.sec.id, 'after')).toBeNull()
    expect(planMove(tree, s.sec.id, s.p0.id, 'inside')).toBeNull()
    // First has two levels below it: nesting it under Second would make 4
    expect(planMove(tree, s.p0.id, s.p1.id, 'inside')).toBeNull()
    expect(planMove(tree, s.p1.id, s.sub.id, 'inside')).toEqual({ parentId: s.sub.id, order: expect.any(String) })
    // indent Second under First; outdent Child next to First
    expect(planIndent(tree, s.p1.id)?.parentId).toBe(s.p0.id)
    expect(planIndent(tree, s.p0.id)).toBeNull()
    const out = planOutdent(tree, s.sub.id)!
    expect(out.parentId).toBe(s.sec.id)
    expect(out.order > s.p0.order && out.order < s.p1.order).toBe(true)
  })
})

describe('accounts in notebooks', () => {
  it('places items as account nodes and enforces where they may go', async () => {
    const { createItem } = await import('../src/item')
    const { planIndent, planMove, planOutdent } = await import('../src/notes')
    const s = sample()
    const list = createNote({ kind: 'accountList', parentId: s.sec.id, order: 'a2', title: 'Google' })
    const inList = createItem({ seq: 1, name: 'In list' })
    inList.location = { parentId: list.id, order: 'a0' }
    const loose = createItem({ seq: 2, name: 'Loose' })
    loose.location = { parentId: s.sec.id, order: 'a3' }
    const unfiled = createItem({ seq: 3 })
    const tree = buildTree([...s.all, list], [inList, loose, unfiled])

    expect(tree.byId.get(inList.id)?.kind).toBe('account')
    expect(tree.byId.has(unfiled.id)).toBe(false)
    expect(tree.items.get(loose.id)?.name).toBe('Loose')
    expect(flattenPages(tree, s.sec.id).map((r) => [r.page.title, r.depth])).toEqual([
      ['First', 0],
      ['Child', 1],
      ['Grandchild', 2],
      ['Second', 0],
      ['Google', 0],
      ['In list', 1],
      ['Loose', 0],
    ])
    expect(sectionOf(tree, inList.id)?.id).toBe(s.sec.id)
    // the list collapses like a page with subpages
    expect(flattenPages(tree, s.sec.id, new Set([list.id])).some((r) => r.page.id === inList.id)).toBe(false)

    // accounts go into lists and sections, never into pages; pages never go into lists
    expect(planMove(tree, loose.id, list.id, 'inside')?.parentId).toBe(list.id)
    expect(planMove(tree, loose.id, s.p0.id, 'inside')).toBeNull()
    expect(planMove(tree, s.p1.id, list.id, 'inside')).toBeNull()
    expect(planMove(tree, list.id, s.p0.id, 'inside')).toBeNull()
    // Tab puts the account into the list above it; Shift+Tab takes it out again
    expect(planIndent(tree, loose.id)?.parentId).toBe(list.id)
    expect(planOutdent(tree, inList.id)?.parentId).toBe(s.sec.id)
    // a section's subtree includes its accounts (so deleting it can unfile them)
    expect(subtree(tree, s.sec.id).filter((n) => n.kind === 'account')).toHaveLength(2)
  })
})
