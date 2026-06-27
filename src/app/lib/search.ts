import type { InlineNode, Node } from './ast'

/**
 * Identifies a single search match's position in the AST.
 *
 * `blockPath` is the index path through nested block nodes from the top-level
 * `Node[]`. For containers:
 *   - `list`: `[...parents, listIndex, itemIndex]` (items are `Node[]` arrays)
 *   - `blockquote`: `[...parents, blockquoteIndex, childIndex]`
 *   - `table`: `[...parents, tableIndex]` (cells live in `inlinePath`)
 *
 * `inlinePath` is the index path through nested inline nodes.
 *   - For tables: `[rowIndex, columnIndex]`, where `rowIndex === -1`
 *     means the match is in a header cell.
 *   - For non-table blocks: `[topInlineIndex, ...nestedInlineIndices]`.
 *
 * `offset` is the visible-character offset of the match within the leaf text
 * node (text, codespan, or kbd value). `length` is the match length.
 */
export type Match = {
  blockPath: number[]
  inlinePath: number[]
  offset: number
  length: number
}

export function findMatches(nodes: Node[], pattern: string): Match[] {
  if (!pattern) return []
  const re = new RegExp(escapeRegex(pattern), 'gi')
  const out: Match[] = []
  walkBlocks(nodes, [], re, out)
  return out
}

function walkBlocks(nodes: Node[], path: number[], re: RegExp, out: Match[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const p = [...path, i]
    const n = nodes[i]
    if (!n) continue
    switch (n.kind) {
      case 'heading':
        walkInline(n.text, p, [], re, out)
        break
      case 'paragraph':
        walkInline(n.inline, p, [], re, out)
        break
      case 'code':
        scanText(n.value, p, [], re, out)
        break
      case 'list':
        for (let j = 0; j < n.items.length; j++) {
          const item = n.items[j]
          if (item) walkBlocks(item.children, [...p, j], re, out)
        }
        break
      case 'blockquote':
        walkBlocks(n.children, p, re, out)
        break
      case 'table':
        n.header.forEach((cell, j) => walkInline(cell, p, [-1, j], re, out))
        n.rows.forEach((row, ri) => row.forEach((cell, j) => walkInline(cell, p, [ri, j], re, out)))
        break
      case 'html':
        scanText(n.value, p, [], re, out)
        break
    }
  }
}

function walkInline(
  inlines: InlineNode[],
  blockPath: number[],
  inlinePath: number[],
  re: RegExp,
  out: Match[],
): void {
  for (let i = 0; i < inlines.length; i++) {
    const ip = [...inlinePath, i]
    const n = inlines[i]
    if (!n) continue
    switch (n.kind) {
      case 'text':
        scanText(n.value, blockPath, ip, re, out)
        break
      case 'codespan':
        scanText(n.value, blockPath, ip, re, out)
        break
      case 'kbd':
        scanText(n.value, blockPath, ip, re, out)
        break
      case 'strong':
        walkInline(n.children, blockPath, ip, re, out)
        break
      case 'em':
        walkInline(n.children, blockPath, ip, re, out)
        break
      case 'link':
        walkInline(n.children, blockPath, ip, re, out)
        break
    }
  }
}

function scanText(
  text: string,
  blockPath: number[],
  inlinePath: number[],
  re: RegExp,
  out: Match[],
): void {
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ blockPath, inlinePath, offset: m.index, length: m[0].length })
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
