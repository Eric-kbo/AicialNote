import { useState } from 'react'
import { cn } from '../../lib/utils'

/** Text field that replaces a row label while renaming. Enter/blur saves, Esc cancels. */
export function InlineRename(props: {
  value: string
  placeholder: string
  onDone: (value: string | null) => void
  className?: string
}) {
  const [value, setValue] = useState(props.value)
  let finished = false
  const finish = (v: string | null) => {
    if (finished) return
    finished = true
    props.onDone(v)
  }
  return (
    <input
      // Rendered only after the user asked to rename, so taking focus is expected.
      ref={(el) => {
        if (el && document.activeElement !== el) {
          el.focus()
          el.select()
        }
      }}
      value={value}
      placeholder={props.placeholder}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') finish(value.trim())
        if (e.key === 'Escape') finish(null)
      }}
      onBlur={() => finish(value.trim())}
      className={cn(
        'h-6 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-sm text-fg shadow-[0_0_0_2px_var(--ring)] outline-none',
        props.className,
      )}
    />
  )
}
