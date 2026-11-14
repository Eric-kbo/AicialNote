import { X } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Dialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Hide the visual header (title stays for screen readers). */
  bare?: boolean
  onOpenAutoFocus?: (e: Event) => void
}) {
  return (
    <D.Root open={props.open} onOpenChange={props.onOpenChange}>
      <D.Portal>
        <D.Overlay className="animate-fade fixed inset-0 z-40 bg-black/25 dark:bg-black/55" />
        <D.Content
          onOpenAutoFocus={props.onOpenAutoFocus}
          className={cn(
            'animate-pop fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 flex-col',
            'overflow-hidden rounded-xl bg-surface shadow-pop outline-none',
            props.className,
          )}
        >
          {props.bare ? (
            <D.Title className="sr-only">{props.title}</D.Title>
          ) : (
            <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line pr-2 pl-4">
              <D.Title className="text-sm font-semibold">{props.title}</D.Title>
              <D.Close className="inline-flex size-7 items-center justify-center rounded-md text-fg-3 hover:bg-hover hover:text-fg">
                <X className="size-4" />
              </D.Close>
            </div>
          )}
          {props.description ? (
            <D.Description className="sr-only">{props.description}</D.Description>
          ) : (
            <D.Description className="sr-only" />
          )}
          <div className="min-h-0 flex-1 overflow-auto">{props.children}</div>
          {props.footer && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-subtle/60 px-4 py-3">
              {props.footer}
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
