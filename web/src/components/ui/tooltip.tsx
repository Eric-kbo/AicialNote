import { Tooltip as T } from 'radix-ui'
import type { ReactNode } from 'react'
import { Kbd } from './kbd'

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={450} skipDelayDuration={200}>
      {children}
    </T.Provider>
  )
}

export function Tooltip(props: {
  content: ReactNode
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{props.children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={props.side ?? 'top'}
          sideOffset={6}
          collisionPadding={8}
          className="animate-fade z-50 flex items-center gap-2 rounded-md bg-[#1c1b19] px-2 py-1 text-xs text-white shadow-pop dark:bg-[#2e2e33]"
        >
          {props.content}
          {props.shortcut && <Kbd tone="inverse">{props.shortcut}</Kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
