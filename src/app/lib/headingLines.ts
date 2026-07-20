import { marked } from 'marked'
import type { Tokens } from 'marked'
import { slugify } from './ast'

/**
 * Maps heading id -> 1-based source line in the original file.
 * `body` is the post-frontmatter markdown (BEFORE mermaid rewriting, so line
 * counts match the file); `offset` is the number of lines the frontmatter block
 * occupied (added back so ids point at real file lines). Ids are produced with
 * the same slugify + document-order dedup as `buildTree`, so they match.
 */
export function computeHeadingLines(params: {
  body: string
  offset: number
}): Record<string, number> {
  const { body, offset } = params
  const tokens = marked.lexer(body)
  const used = new Set<string>()
  const lines: Record<string, number> = {}
  let line = 0 // lines consumed before the current token
  for (const t of tokens) {
    if (t.type === 'heading') {
      const h = t as Tokens.Heading
      let id = slugify(h.text) || 'section'
      const base = id
      let n = 2
      while (used.has(id)) id = `${base}-${n++}`
      used.add(id)
      lines[id] = offset + line + 1
    }
    line += countNewlines(t.raw)
  }
  return lines
}

export function countNewlines(s: string): number {
  let count = 0
  for (const ch of s) if (ch === '\n') count++
  return count
}
