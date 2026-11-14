import type { DropPosition, NoteTree } from '@aicialnote/core'
import { planMove } from '@aicialnote/core'
import { type DragEvent, useState } from 'react'

/**
 * Drag and drop for notebook / section / page rows, on top of the native
 * HTML5 API. The dragged id lives in a module variable because `dragover`
 * handlers can't read dataTransfer contents.
 */
const MIME = 'application/x-aicialnote-note'
let dragging: string | null = null

export function dragSourceProps(id: string) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      dragging = id
      e.dataTransfer.setData(MIME, id)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => {
      dragging = null
    },
  }
}

/**
 * Drop handling for one row. `positions` are the zones the row offers;
 * a zone is only shown when `planMove` accepts the move.
 */
export function useDropTarget(opts: {
  tree: NoteTree | undefined
  targetId: string
  positions: DropPosition[]
  onDrop: (id: string, position: DropPosition) => void
}) {
  const [over, setOver] = useState<DropPosition | null>(null)

  const pick = (e: DragEvent): DropPosition | null => {
    if (!dragging || !opts.tree) return null
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - rect.top) / rect.height
    const has = (p: DropPosition) => opts.positions.includes(p)
    const ok = (p: DropPosition) => has(p) && planMove(opts.tree!, dragging!, opts.targetId, p) !== null
    // With an "inside" zone the edges are thin; without one, split in half.
    const edge = has('inside') ? 0.28 : 0.5
    const wanted: DropPosition = y < edge ? 'before' : y > 1 - edge ? 'after' : 'inside'
    if (ok(wanted)) return wanted
    // Fall back to whatever this row accepts (e.g. a section dropped onto a notebook).
    return (['inside', 'before', 'after'] as const).find(ok) ?? null
  }

  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        const p = pick(e)
        if (!p) return setOver(null)
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (p !== over) setOver(p)
      },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null)
      },
      onDrop: (e: DragEvent) => {
        const p = pick(e)
        const id = e.dataTransfer.getData(MIME) || dragging
        setOver(null)
        dragging = null
        if (!p || !id) return
        e.preventDefault()
        opts.onDrop(id, p)
      },
    },
  }
}
