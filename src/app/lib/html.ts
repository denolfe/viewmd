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
