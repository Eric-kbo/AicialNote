import type { NoteColor } from '@aicialnote/core'
import { BookText } from 'lucide-react'
import { cn } from '../../lib/utils'

const color = (c?: NoteColor) => `var(--nb-${c ?? 'gray'})`

export function ColorSwatch({ color: c, className }: { color?: NoteColor; className?: string }) {
  return (
    <span className={cn('inline-block size-2.5 shrink-0 rounded-[3px]', className)} style={{ background: color(c) }} />
  )
}

/** Notebook glyph, tinted with the notebook colour. */
export function NotebookIcon({ color: c, className }: { color?: NoteColor; className?: string }) {
  return <BookText className={cn('size-4 shrink-0', className)} style={{ color: color(c) }} />
}

/** Section marker: a short vertical tab, like OneNote's coloured section tabs. */
export function SectionTab({ color: c, className }: { color?: NoteColor; className?: string }) {
  return (
    <span
      className={cn('inline-block h-3.5 w-[3px] shrink-0 rounded-full', className)}
      style={{ background: color(c) }}
    />
  )
}
