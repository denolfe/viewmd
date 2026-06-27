// Strip raw HTML down to its visible text content.
//
// Strategy: drop every tag, render whatever text was inside as a muted
// plaintext span. We do not try to preserve HTML semantics (no <details>
// collapsible, no <sub>/<sup> styling). The output never goes through an
// HTML interpreter, so this is purely a visual cleanup — not a security
// boundary.
//
// We accept regex risk here because our inputs are hand-written README HTML
// (well-formed, non-adversarial), not arbitrary web HTML.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function stripHtml(input: string): string {
  let s = input

  // <script>/<style> are the only tags whose *contents* must die with them.
  // Everything else: drop the tag, keep the inner text. Done first so the
  // generic tag-stripper below doesn't leave bare JS/CSS source visible.
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')

  s = s.replace(/<!--[\s\S]*?-->/g, '')

  // Reshape <details> before the generic tag-strip so we can keep the
  // summary/body structure. Output is "▾ summary\n  body" (always expanded —
  // we can't actually collapse anything in the TUI). Nested <details>
  // flatten to a single level; the inner content is preserved.
  s = expandDetails(s)

  // Match any opening or closing tag and its attributes. The leading
  // `[a-zA-Z]` anchor avoids gobbling literal `<` followed by punctuation
  // (e.g. `a < b` in code paragraphs that slipped past markdown).
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '')

  s = decodeEntities(s)

  // Collapse the whitespace that block HTML leaves behind: trailing spaces
  // before a newline, and runs of 3+ blank lines compressed to a single
  // paragraph break. Final trim removes leading/trailing blank lines from
  // wrapper elements like <div align="center">.
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

// Replaces every <details>...</details> with "▾ summary\n  body". Summary
// and body retain their HTML — they'll be stripped by the regular passes
// once expansion is done.
function expandDetails(s: string): string {
  return s.replace(/<details\b[^>]*>([\s\S]*?)<\/details>/gi, (_match, inner: string) => {
    const sumRe = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i
    const sumMatch = sumRe.exec(inner)
    const summary = sumMatch ? sumMatch[1]!.trim() : ''
    const body = (sumMatch ? inner.replace(sumMatch[0], '') : inner).trim()
    const indented = body.replace(/^/gm, '  ')
    return summary ? `▾ ${summary}\n${indented}\n` : `▾\n${indented}\n`
  })
}

// Structured parse of raw HTML into segments the block renderer can iterate.
// Preserves <a> (clickable) and <img> (label) so badge rows / nav lists keep
// their URLs and image labels instead of flattening to text. Everything else
// gets stripped down to inner text, matching stripHtml's behavior.
//
// Whitespace inside the source HTML is collapsed (multiple spaces/newlines →
// single space), since hand-written README HTML wraps lines for editor
// readability and we don't want those raw newlines bleeding into the render.
const BLOCK_BREAK = '\x01'

export type HtmlSegment =
  | { kind: 'text'; value: string }
  | { kind: 'image'; alt: string; src: string }
  | { kind: 'link'; href: string; children: HtmlSegment[] }

export function parseHtmlSegments(input: string): HtmlSegment[] {
  let s = input
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  // Single-block <details> still go through here (multi-block versions are
  // already rolled up into a real AST node by buildTree). The expansion turns
  // them into "▾ summary ... body" text, which then flows through as text
  // segments alongside any anchors/images.
  s = expandDetails(s)

  // Insert a sentinel at block-tag boundaries so adjacent <p>/<h*>/<hr>
  // chunks don't flow into a single line when a README packs them together
  // without blank lines. We can't use literal '\n' because finalize collapses
  // source soft-wrap newlines into spaces; the sentinel survives that pass
  // and gets converted to a real newline at the very end.
  s = s.replace(/<br\s*\/?\s*>/gi, BLOCK_BREAK)
  s = s.replace(/<hr\s*\/?\s*>/gi, BLOCK_BREAK)
  s = s.replace(
    /<\/(p|h[1-6]|div|section|article|li|ul|ol|tr|blockquote)\s*>/gi,
    BLOCK_BREAK,
  )

  // Stack of sibling lists; top of stack is "where new segments go". Pushing
  // a link opens a new children list; closing pops it.
  const root: HtmlSegment[] = []
  const stack: HtmlSegment[][] = [root]
  const top = () => stack[stack.length - 1]!

  // Single regex to find anchors and self-closing-ish images. Other tags fall
  // through to the post-pass tag-stripper inside text segments.
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
      top().push({
        kind: 'image',
        alt: getAttr(attrs, 'alt'),
        src: getAttr(attrs, 'src'),
      })
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

// Strip leftover non-anchor tags out of text segments, decode entities, and
// collapse whitespace. Adjacent empty/whitespace-only text segments get
// merged so the render doesn't emit weird gaps.
function finalize(segs: HtmlSegment[]): HtmlSegment[] {
  const cleaned = segs.map(s => {
    if (s.kind === 'text') {
      const stripped = s.value.replace(/<\/?[a-zA-Z][^>]*>/g, '')
      const decoded = decodeEntities(stripped)
      // Collapse ALL real whitespace (incl. source soft-wrap newlines) down
      // to single spaces, then convert sentinels to real newlines. Adjacent
      // sentinels collapse so a doubled-up boundary becomes one line break.
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
  // Trim outer whitespace on leading/trailing text segments.
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

// Decodes the named entities listed above plus any numeric reference.
// We re-decode after stripping because some upstream parsers (and some
// hand-written HTML) leave entities encoded. Unknown named entities are
// passed through verbatim rather than swallowed — easier to spot bugs.
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
