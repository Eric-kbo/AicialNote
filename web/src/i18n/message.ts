/**
 * A small subset of ICU MessageFormat, enough for UI strings in any language:
 *
 *   {name}                                      the value of `name`
 *   {n, plural, =0 {none} one {# day} other {# days}}
 *                                               picks a branch with Intl.PluralRules; `#` is `n`, formatted
 *
 * Plural categories are zero / one / two / few / many / other, as defined by CLDR for each language. `other` is
 * required. Branches can contain further `{var}` and plural blocks. There is no quoting: write ’ for apostrophes.
 */

export type Vars = Record<string, string | number>

type Part =
  | { kind: 'text'; text: string }
  | { kind: 'var'; name: string }
  | { kind: 'plural'; name: string; branches: Map<string, Part[]> }

export class MessageSyntaxError extends Error {}

const cache = new Map<string, Part[]>()

function parse(src: string): Part[] {
  let hit = cache.get(src)
  if (!hit) {
    hit = new Parser(src).parseMessage(false)
    cache.set(src, hit)
  }
  return hit
}

class Parser {
  i = 0
  constructor(readonly src: string) {}

  fail(msg: string): never {
    throw new MessageSyntaxError(`${msg} at ${this.i} in “${this.src}”`)
  }

  /** Parses until the end, or until the `}` that closes the current branch when `nested`. */
  parseMessage(nested: boolean): Part[] {
    const parts: Part[] = []
    let text = ''
    while (this.i < this.src.length) {
      const c = this.src[this.i]!
      if (c === '}') {
        if (!nested) this.fail('Unexpected }')
        break
      }
      if (c === '{') {
        if (text) parts.push({ kind: 'text', text })
        text = ''
        parts.push(this.parseArgument())
        continue
      }
      text += c
      this.i++
    }
    if (text) parts.push({ kind: 'text', text })
    return parts
  }

  parseArgument(): Part {
    this.i++ // {
    const name = this.word()
    if (!name) this.fail('Expected a name')
    this.space()
    if (this.src[this.i] === '}') {
      this.i++
      return { kind: 'var', name }
    }
    if (this.src[this.i] !== ',') this.fail('Expected , or }')
    this.i++
    this.space()
    const type = this.word()
    if (type !== 'plural') this.fail(`Unsupported argument type “${type}”`)
    this.space()
    if (this.src[this.i] !== ',') this.fail('Expected ,')
    this.i++
    const branches = new Map<string, Part[]>()
    for (;;) {
      this.space()
      if (this.src[this.i] === '}') {
        this.i++
        break
      }
      const exact = this.src[this.i] === '='
      if (exact) this.i++
      const key = exact ? `=${this.word()}` : this.word()
      if (!key || key === '=') this.fail('Expected a plural category')
      this.space()
      if (this.src[this.i] !== '{') this.fail('Expected {')
      this.i++
      branches.set(key, this.parseMessage(true))
      if (this.src[this.i] !== '}') this.fail('Unclosed branch')
      this.i++
    }
    if (!branches.has('other')) this.fail('A plural needs an “other” branch')
    return { kind: 'plural', name, branches }
  }

  word(): string {
    const m = /^[\w-]+/.exec(this.src.slice(this.i))
    if (!m) return ''
    this.i += m[0].length
    return m[0]
  }

  space() {
    while (/\s/.test(this.src[this.i] ?? '')) this.i++
  }
}

const pluralRules = new Map<string, Intl.PluralRules>()
const numberFormats = new Map<string, Intl.NumberFormat>()

function memo<T>(map: Map<string, T>, locale: string, make: (l: string) => T): T {
  let v = map.get(locale)
  if (!v) {
    try {
      v = make(locale)
    } catch {
      v = make('en')
    }
    map.set(locale, v)
  }
  return v
}

export interface FormatOptions {
  /** Applied to the literal text of the message only, never to values. Used by the pseudo-locale. */
  text?: (s: string) => string
}

export function formatMessage(template: string, vars: Vars | undefined, locale: string, opts: FormatOptions = {}) {
  let parts: Part[]
  try {
    parts = parse(template)
  } catch {
    // A broken translation must not break the page; show it as written.
    return template
  }
  const text = opts.text ?? ((s: string) => s)
  const render = (ps: Part[], hash?: string): string =>
    ps
      .map((p) => {
        if (p.kind === 'text') return text(hash === undefined ? p.text : p.text.replaceAll('#', hash))
        const value = vars?.[p.name]
        if (p.kind === 'var') return value === undefined ? `{${p.name}}` : String(value)
        const n = Number(value)
        if (value === undefined || Number.isNaN(n)) return `{${p.name}}`
        const branch =
          p.branches.get(`=${n}`) ??
          p.branches.get(memo(pluralRules, locale, (l) => new Intl.PluralRules(l)).select(n)) ??
          p.branches.get('other')!
        return render(branch, memo(numberFormats, locale, (l) => new Intl.NumberFormat(l)).format(n))
      })
      .join('')
  return render(parts)
}

/** The argument names a message uses. Throws MessageSyntaxError when the message is malformed. */
export function messageVars(template: string): Set<string> {
  const out = new Set<string>()
  const walk = (ps: Part[]) => {
    for (const p of ps) {
      if (p.kind === 'text') continue
      out.add(p.name)
      if (p.kind === 'plural') for (const b of p.branches.values()) walk(b)
    }
  }
  walk(new Parser(template).parseMessage(false))
  return out
}

const ACCENTED: Record<string, string> = Object.fromEntries(
  [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [
    c,
    'ȧƀƈḓḗƒɠħīĵķŀḿƞǿƥɋřşŧŭṽẇẋẏẑȦƁƇḒḖƑƓĦĪĴĶĿḾȠǾƤɊŘŞŦŬṼẆẊẎẐ'[i]!,
  ]),
)

/**
 * Pseudo-localisation for spotting strings that skipped `t()` and layouts that break with longer text:
 * accents every Latin letter and pads the text by about 40%, the length German or Finnish often needs.
 */
export function pseudo(s: string): string {
  if (!s.trim()) return s
  const accented = s.replace(/[a-zA-Z]/g, (c) => ACCENTED[c] ?? c)
  const pad = '·'.repeat(Math.ceil(s.length * 0.4))
  return `⟦${accented}${pad}⟧`
}
