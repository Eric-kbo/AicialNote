import { Check, ChevronRight } from 'lucide-react'
import { DropdownMenu as M } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Kbd } from './kbd'

export const Menu = M.Root
export const MenuTrigger = M.Trigger
export const MenuSub = M.Sub

// Long menus (the language list) scroll instead of running off a short screen.
const panel =
  'animate-pop z-50 min-w-[180px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-lg bg-surface p-1 text-sm shadow-pop outline-none'

export function MenuContent({ className, align = 'end', ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={4} collisionPadding={8} className={cn(panel, className)} {...props} />
    </M.Portal>
  )
}

const itemClass =
  'relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-fg outline-none ' +
  'data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-3'

export function MenuItem({
  icon,
  shortcut,
  danger,
  children,
  className,
  ...props
}: ComponentProps<typeof M.Item> & { icon?: ReactNode; shortcut?: string; danger?: boolean }) {
  return (
    <M.Item className={cn(itemClass, danger && 'text-st-red [&>svg]:text-st-red', className)} {...props}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </M.Item>
  )
}

/** Checkbox item that keeps the menu open, for multi-select filters. */
export function MenuCheckItem({
  checked,
  children,
  icon,
  onSelect,
  ...props
}: ComponentProps<typeof M.CheckboxItem> & { icon?: ReactNode }) {
  return (
    <M.CheckboxItem
      {...props}
      checked={checked}
      className={itemClass}
      onSelect={(e) => {
        e.preventDefault()
        onSelect?.(e)
      }}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      <span className="flex size-4 items-center justify-center">
        <M.ItemIndicator>
          <Check className="size-3.5 text-accent" />
        </M.ItemIndicator>
      </span>
    </M.CheckboxItem>
  )
}

export function MenuRadioGroup(props: ComponentProps<typeof M.RadioGroup>) {
  return <M.RadioGroup {...props} />
}

export function MenuRadioItem({ children, icon, ...props }: ComponentProps<typeof M.RadioItem> & { icon?: ReactNode }) {
  return (
    <M.RadioItem className={itemClass} {...props}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      <M.ItemIndicator>
        <Check className="size-3.5 text-accent" />
      </M.ItemIndicator>
    </M.RadioItem>
  )
}

export function MenuSubTrigger({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <M.SubTrigger className={cn(itemClass, 'data-[state=open]:bg-hover')}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      <ChevronRight className="size-3.5 text-fg-3" />
    </M.SubTrigger>
  )
}

export function MenuSubContent(props: ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={6} collisionPadding={8} className={panel} {...props} />
    </M.Portal>
  )
}

export function MenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-line" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2 pt-1.5 pb-1 text-xs text-fg-3">{children}</M.Label>
}
