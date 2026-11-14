import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Tooltip } from './tooltip'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]',
  secondary:
    'bg-surface text-fg border border-line hover:bg-hover hover:border-line-strong shadow-[0_1px_1px_rgb(0_0_0/0.03)]',
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  danger: 'text-st-red hover:bg-[color-mix(in_oklab,var(--st-red)_10%,transparent)]',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2 gap-1.5 text-sm rounded-md',
  md: 'h-8 px-3 gap-2 text-sm rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-100',
        'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  shortcut?: string
  size?: 'xs' | 'sm' | 'md'
  children: ReactNode
  tooltip?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size = 'sm', className, children, tooltip = true, type = 'button', ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors duration-100',
        'hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg disabled:opacity-40',
        size === 'xs' && 'size-6 [&_svg]:size-3.5',
        size === 'sm' && 'size-7 [&_svg]:size-4',
        size === 'md' && 'size-8 [&_svg]:size-4',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
  return tooltip ? (
    <Tooltip content={label} shortcut={shortcut}>
      {button}
    </Tooltip>
  ) : (
    button
  )
})
