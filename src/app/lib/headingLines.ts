import type { Tokens } from 'marked'
import { slugify } from './ast'

/**
 * Maps heading id -> 1-based source line in the original file.
 * `tokens` is the lexed post-frontmatter body; every token's `raw` must still
 * be the source fence text (diagram rendering only rewrites `text`/`lang`), so
 * newline counts match the file. `offset` is the number of lines the
 * frontmatter block occupied (added back so ids point at real file lines). Ids
 * are produced with the same slugify + document-order dedup as `buildTree`, so
 * they match.
 */
export function computeHeadingLines(params: {
  tokens: Tokens.Generic[]
  offset: number
}): Record<string, number> {
  const { tokens, offset } = params
  const used = new Set<string>()
  const lines: Record<string, number> = {}
  walk(tokens, 0)
  return lines

  // `startLine` = 0-based line index (within body) where `tokens[0]` begins.
  // Mirrors ast.ts `blockToNode` recursion (blockquote/list children share one
  // dedup counter in document order) so ids + numbering match `buildTree`.
  function walk(tokens: Tokens.Generic[], startLine: number): void {
    let line = startLine
    for (const t of tokens) {
      if (t.type === 'heading') {
        const h = t as Tokens.Heading
        let id = slugify(h.text) || 'section'
        const base = id
        let n = 2
        while (used.has(id)) id = `${base}-${n++}`
        used.add(id)
        lines[id] = offset + line + 1
      } else if (t.type === 'blockquote') {
        const b = t as Tokens.Blockquote
        walk((b.tokens ?? []) as Tokens.Generic[], line)
      } else if (t.type === 'list') {
        const l = t as Tokens.List
        let itemLine = line
        for (const item of l.items) {
          walk((item.tokens ?? []) as Tokens.Generic[], itemLine)
          itemLine += countNewlines(item.raw ?? '')
        }
      }
      line += countNewlines(t.raw ?? '')
    }
  }
}

/** indexOf-driven: several times faster than a per-character loop on large files. */
export function countNewlines(s: string): number {
  let count = 0
  let i = s.indexOf('\n')
  while (i !== -1) {
    count++
    i = s.indexOf('\n', i + 1)
  }
  return count
}
