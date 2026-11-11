import { getTemplate, type StatusColor } from '@aicialnote/core'
import { Apple, Globe, Link2, Mail, Shapes, UserRound } from 'lucide-react'
import type { SVGProps } from 'react'
import { cn } from '../lib/utils'

function GoogleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M20.5 12.2c0-.6-.1-1.2-.2-1.8H12v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5Z"
        fill="currentColor"
      />
      <path
        d="M12 21c2.4 0 4.4-.8 5.9-2.2L15 16.5c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21Z"
        fill="currentColor"
        opacity=".75"
      />
      <path d="M7 13.7a5.4 5.4 0 0 1 0-3.4V8H4a9 9 0 0 0 0 8l3-2.3Z" fill="currentColor" opacity=".55" />
      <path
        d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 8l3 2.3c.7-2.1 2.7-3.7 5-3.7Z"
        fill="currentColor"
        opacity=".9"
      />
    </svg>
  )
}

function MicrosoftMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <rect x="3.5" y="3.5" width="7.8" height="7.8" rx=".6" />
      <rect x="12.7" y="3.5" width="7.8" height="7.8" rx=".6" opacity=".7" />
      <rect x="3.5" y="12.7" width="7.8" height="7.8" rx=".6" opacity=".7" />
      <rect x="12.7" y="12.7" width="7.8" height="7.8" rx=".6" opacity=".45" />
    </svg>
  )
}

const ICONS = {
  google: GoogleMark,
  microsoft: MicrosoftMark,
  apple: Apple,
  mail: Mail,
  globe: Globe,
  link: Link2,
  user: UserRound,
  shapes: Shapes,
} as const

const TINTS: Record<string, string> = {
  blue: '#3e63dd',
  green: '#2f8a55',
  orange: '#c8641e',
  red: '#cd3c3c',
  violet: '#7656d2',
  gray: 'var(--fg-2)',
  teal: '#0f7f96',
}

/** Small tinted tile identifying a card's type. */
export function TemplateIcon({ template, size = 'md' }: { template?: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = getTemplate(template) ?? getTemplate('custom')!
  const Icon = ICONS[t.icon as keyof typeof ICONS] ?? Shapes
  return (
    <span
      style={{ color: TINTS[t.tint] }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[5px]',
        'bg-[color-mix(in_oklab,currentColor_11%,transparent)] ring-1 ring-[color-mix(in_oklab,currentColor_14%,transparent)] ring-inset',
        size === 'sm' && 'size-[18px] [&_svg]:size-3',
        size === 'md' && 'size-6 [&_svg]:size-3.5',
        size === 'lg' && 'size-8 [&_svg]:size-[18px]',
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  )
}

export const statusColorVar: Record<StatusColor, string> = {
  green: 'var(--st-green)',
  blue: 'var(--st-blue)',
  yellow: 'var(--st-yellow)',
  red: 'var(--st-red)',
  gray: 'var(--st-gray)',
}

export function StatusDot({ color, className }: { color: StatusColor; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ background: statusColorVar[color] }}
    />
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M9.5 23 16 9l6.5 14"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="20.6" r="2" fill="#3e63dd" />
    </svg>
  )
}

/** The GitHub mark, monochrome, for links to the source code. */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}
