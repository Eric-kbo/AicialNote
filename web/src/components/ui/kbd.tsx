import { cn } from '../../lib/utils'

export function Kbd({ children, tone = 'default' }: { children: string; tone?: 'default' | 'inverse' }) {
  return (
    <span className="inline-flex gap-0.5">
      {children.split('+').map((k) => (
        <kbd
          key={k}
          className={cn(
            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 font-sans text-2xs font-medium',
            tone === 'default' && 'border border-line bg-subtle text-fg-3',
            tone === 'inverse' && 'bg-white/15 text-white/80',
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}
