// Raw HTML handling — strip to plaintext, segment for the block renderer,
// or convert back to markdown so AST lifting can restore styling.
// Inputs are hand-written README HTML; regex-based parsing is intentional.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

// Sentinel marks block-tag boundaries during segmenting; survives the
// whitespace-collapse pass and becomes a real newline at the end.
const BLOCK_BREAK = '\x01'

export type HtmlSegment =
  | { kind: 'text'; value: string }
  | { kind: 'image'; alt: string; src: string }
  | { kind: 'link'; href: string; children: HtmlSegment[] }

export function stripHtml(input: string): string {
  let s = input
  // <script>/<style> are the only tags whose contents must die with them.
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = expandDetails(s)
  // Leading `[a-zA-Z]` anchor avoids gobbling `a < b` style comparisons.
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '')
  s = decodeEntities(s)
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

export function parseHtmlSegments(input: string): HtmlSegment[] {
  let s = input
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = expandDetails(s)

  // Block-tag boundaries become sentinels so adjacent <p>/<h*>/<hr> chunks
  // in one html token don't flow into a single line.
  s = s.replace(/<br\s*\/?\s*>/gi, BLOCK_BREAK)
  s = s.replace(/<hr\s*\/?\s*>/gi, BLOCK_BREAK)
  s = s.replace(/<\/(p|h[1-6]|div|section|article|li|ul|ol|tr|blockquote)\s*>/gi, BLOCK_BREAK)

  // Stack of sibling lists; pushing a link opens a children list, closing pops.
  const root: HtmlSegment[] = []
  const stack: HtmlSegment[][] = [root]
  const top = () => stack[stack.length - 1]!

  const TAG_RE = /<(\/?)(a|img)\b([^>]*)>/gi
  let last = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(s)) !== null) {
    const before = s.slice(last, m.index)
    if (before) top().push({ kind: 'text', value: before })
    const slash = m[1]
    const tag = m[2]!.toLowerCase()
    const attrs = m[3] ?? ''
    if (tag === 'img') {
      top().push({ kind: 'image', alt: getAttr(attrs, 'alt'), src: getAttr(attrs, 'src') })
    } else if (tag === 'a' && !slash) {
      const children: HtmlSegment[] = []
      top().push({ kind: 'link', href: getAttr(attrs, 'href'), children })
      stack.push(children)
    } else if (tag === 'a' && slash) {
      if (stack.length > 1) stack.pop()
    }
    last = m.index + m[0].length
  }
  const tail = s.slice(last)
  if (tail) top().push({ kind: 'text', value: tail })

  return finalize(root)
}

// Best-effort HTML → markdown for nodes that contain structure marked can
// re-parse (headings, lists, paragraphs). Inline conversions run first so
// nested cases like <a><strong>X</strong></a> survive.
export function htmlToMarkdown(html: string): string {
  let s = html
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')

  s = s.replace(/<img\b([^>]*?)\/?>/gi, (_m, attrs: string) => {
    const alt = getAttr(attrs, 'alt')
    const src = getAttr(attrs, 'src')
    return src ? `![${alt}](${src})` : ''
  })

  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_m, attrs: string, inner: string) => {
    const href = getAttr(attrs, 'href')
    const text = inner.trim()
    return href ? `[${text}](${href})` : text
  })

  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => `**${inner}**`)
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => `*${inner}*`)
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner: string) => `\`${inner}\``)

  s = s.replace(
    /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_m, level: string, inner: string) => `\n\n${'#'.repeat(Number(level))} ${inner.trim()}\n\n`,
  )

  s = s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let n = 0
    const items = inner.replace(
      /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
      (_im, item: string) => `${++n}. ${item.trim()}\n`,
    )
    return `\n\n${items}\n`
  })

  s = s.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner: string) => {
    const items = inner.replace(
      /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
      (_im, item: string) => `- ${item.trim()}\n`,
    )
    return `\n\n${items}\n`
  })

  s = s.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, item: string) => `- ${item.trim()}\n`)
  s = s.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner: string) => `\n\n${inner.trim()}\n\n`)
  s = s.replace(/<br\s*\/?>/gi, '  \n')
  s = s.replace(/<hr\s*\/?>/gi, '\n\n---\n\n')

  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '')
  s = decodeEntities(s)
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

export function htmlContainsBlockMarkdown(html: string): boolean {
  return /<(h[1-6]|ul|ol|li)\b/i.test(html)
}

// Replaces each <details>...</details> with "▾ summary\n  body" — always
// expanded since the TUI can't actually collapse. Nested details flatten.
function expandDetails(s: string): string {
  return s.replace(/<details\b[^>]*>([\s\S]*?)<\/details>/gi, (_match, inner: string) => {
    const sumMatch = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i.exec(inner)
    const summary = sumMatch ? sumMatch[1]!.trim() : ''
    const body = (sumMatch ? inner.replace(sumMatch[0], '') : inner).trim()
    const indented = body.replace(/^/gm, '  ')
    return summary ? `▾ ${summary}\n${indented}\n` : `▾\n${indented}\n`
  })
}

function finalize(segs: HtmlSegment[]): HtmlSegment[] {
  const cleaned = segs.map(s => {
    if (s.kind === 'text') {
      const stripped = s.value.replace(/<\/?[a-zA-Z][^>]*>/g, '')
      const decoded = decodeEntities(stripped)
      // Collapse real whitespace to single spaces, then sentinels to newlines.
      const normalized = decoded
        .replace(/[ \t\n\r]+/g, ' ')
        .replace(/ ?\x01 ?/g, '\n')
        .replace(/\n+/g, '\n')
      return { kind: 'text' as const, value: normalized }
    }
    if (s.kind === 'link') return { ...s, children: finalize(s.children) }
    return s
  })

  const out: HtmlSegment[] = []
  for (const seg of cleaned) {
    if (seg.kind === 'text') {
      const prev = out[out.length - 1]
      if (prev && prev.kind === 'text') {
        prev.value += seg.value
        continue
      }
    }
    out.push(seg)
  }
  if (out[0]?.kind === 'text') out[0] = { kind: 'text', value: out[0].value.replace(/^\s+/, '') }
  const lastIdx = out.length - 1
  if (out[lastIdx]?.kind === 'text') {
    const t = out[lastIdx]
    if (t?.kind === 'text') out[lastIdx] = { kind: 'text', value: t.value.replace(/\s+$/, '') }
  }
  return out.filter(s => !(s.kind === 'text' && s.value === ''))
}

function getAttr(attrs: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = re.exec(attrs)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : ''
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const cp = parseInt(body.slice(2), 16)
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match
    }
    if (body.startsWith('#')) {
      const cp = parseInt(body.slice(1), 10)
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match
    }
    return NAMED_ENTITIES[body] ?? match
  })
}
