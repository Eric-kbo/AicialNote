import { ArrowLeft } from 'lucide-react'
import { Fragment, type ReactNode, useEffect } from 'react'
import { LegalLinks, PublicHeader } from '../components/PublicHeader'
import { type MessageKey, useI18n } from '../i18n'
import { CONTACT_EMAIL, SITE_HOST } from '../lib/links'

/** Filled into {site} and {email} in the legal texts, so self-hosted builds show their own. */
const VARS = { site: SITE_HOST, email: CONTACT_EMAIL }

export type LegalDoc = 'privacy' | 'terms'

/** Public pages that must load without signing in (Google's OAuth consent screen links to them). */
export function legalDocFor(pathname: string): LegalDoc | null {
  const p = pathname.replace(/\/+$/, '')
  if (p === '/privacy') return 'privacy'
  if (p === '/terms') return 'terms'
  return null
}

type Section = readonly [heading: MessageKey, body: MessageKey]

const DOCS: Record<LegalDoc, { title: MessageKey; intro: MessageKey; sections: readonly Section[] }> = {
  privacy: {
    title: 'legal.privacy.title',
    intro: 'legal.privacy.intro',
    sections: [
      ['legal.privacy.where.h', 'legal.privacy.where.p'],
      ['legal.privacy.server.h', 'legal.privacy.server.p'],
      ['legal.privacy.google.h', 'legal.privacy.google.p'],
      ['legal.privacy.microsoft.h', 'legal.privacy.microsoft.p'],
      ['legal.privacy.logs.h', 'legal.privacy.logs.p'],
      ['legal.privacy.never.h', 'legal.privacy.never.p'],
      ['legal.privacy.delete.h', 'legal.privacy.delete.p'],
      ['legal.privacy.security.h', 'legal.privacy.security.p'],
      ['legal.privacy.children.h', 'legal.privacy.children.p'],
      ['legal.privacy.changes.h', 'legal.privacy.changes.p'],
      ['legal.contact.h', 'legal.contact.p'],
    ],
  },
  terms: {
    title: 'legal.terms.title',
    intro: 'legal.terms.intro',
    sections: [
      ['legal.terms.service.h', 'legal.terms.service.p'],
      ['legal.terms.data.h', 'legal.terms.data.p'],
      ['legal.terms.use.h', 'legal.terms.use.p'],
      ['legal.terms.thirdParty.h', 'legal.terms.thirdParty.p'],
      ['legal.terms.warranty.h', 'legal.terms.warranty.p'],
      ['legal.terms.liability.h', 'legal.terms.liability.p'],
      ['legal.terms.end.h', 'legal.terms.end.p'],
      ['legal.terms.changes.h', 'legal.terms.changes.p'],
      ['legal.contact.h', 'legal.contact.p'],
    ],
  },
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t } = useI18n()
  const { title, intro, sections } = DOCS[doc]

  useEffect(() => {
    document.title = `${t(title)} · AicialNote`
  }, [t, title])

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="flex flex-1 justify-center px-5 pt-10 pb-16">
        <article data-legal={doc} className="w-full max-w-[680px]">
          <a
            href="/"
            className="-ml-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm text-fg-3 hover:bg-hover hover:text-fg"
          >
            <ArrowLeft className="size-3.5" />
            {t('legal.back')}
          </a>
          <h1 className="mt-6 text-[26px] leading-[34px] font-semibold tracking-[-0.02em]">{t(title)}</h1>
          <p className="mt-2 text-xs text-fg-3">{t('legal.updated')}</p>
          <p className="mt-6 text-[14px] leading-[24px] text-fg-2 text-pretty">{t(intro, VARS)}</p>
          {sections.map(([h, p]) => (
            <section key={h} className="mt-9">
              <h2 className="text-[15px] leading-6 font-semibold text-fg">{t(h)}</h2>
              <Body text={t(p, VARS)} />
            </section>
          ))}
        </article>
      </main>
      <LegalLinks className="pb-6" />
    </div>
  )
}

/** Blocks separated by a blank line; a block whose lines all start with "- " is a list. */
function Body({ text }: { text: string }) {
  return (
    <div className="mt-2 flex flex-col gap-3 text-[14px] leading-[24px] text-fg-2 text-pretty">
      {text.split('\n\n').map((block) => {
        const lines = block.split('\n')
        if (lines.every((l) => l.startsWith('- ')))
          return (
            <ul key={block} className="flex list-disc flex-col gap-1 pl-5 marker:text-fg-3">
              {lines.map((l) => (
                <li key={l}>{linkify(l.slice(2))}</li>
              ))}
            </ul>
          )
        return <p key={block}>{linkify(block)}</p>
      })}
    </div>
  )
}

// Stops before CJK punctuation so "…policy。" doesn't swallow the full stop.
const LINK = /(https:\/\/[^\s，。；、）)]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g

function linkify(text: string): ReactNode {
  const out: ReactNode[] = []
  let at = 0
  for (const m of text.matchAll(LINK)) {
    const start = m.index
    if (start > at) out.push(<Fragment key={`t${at}`}>{text.slice(at, start)}</Fragment>)
    const href = m[0].startsWith('https://') ? m[0] : `mailto:${m[0]}`
    out.push(
      <a key={`a${start}`} href={href} className="break-words text-accent hover:underline" rel="noreferrer">
        {m[0]}
      </a>,
    )
    at = start + m[0].length
  }
  if (at < text.length) out.push(<Fragment key={`t${at}`}>{text.slice(at)}</Fragment>)
  return out
}
