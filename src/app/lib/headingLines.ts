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
  const used = new Set<string>()
  const lines: Record<string, number> = {}
  walk(marked.lexer(body) as Tokens.Generic[], 0)
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

export function countNewlines(s: string): number {
  let count = 0
  for (const ch of s) if (ch === '\n') count++
  return count
}
