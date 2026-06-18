import type { InlineNode, TocEntry } from './ast'

const MARKER_WIDTH = 2 // marker glyph + trailing space
const INDENT_PER_LEVEL = 2
const PILL_GLYPH_WIDTH = 2 // ▐ and ▌ edge characters

export function tocContentWidth(toc: TocEntry[]): number {
  let max = 0
  const visit = (entries: TocEntry[]): void => {
    for (const e of entries) {
      const w = INDENT_PER_LEVEL * (e.level - 1) + MARKER_WIDTH + inlineVisibleWidth(e.inline)
      if (w > max) max = w
      if (e.children.length) visit(e.children)
    }
  }
  visit(toc)
  return max
}

export function inlineVisibleWidth(nodes: InlineNode[]): number {
  let total = 0
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        total += n.value.length
        break
      case 'codespan':
      case 'kbd':
        total += n.value.length + PILL_GLYPH_WIDTH
        break
      case 'strong':
      case 'em':
      case 'link':
        total += inlineVisibleWidth(n.children)
        break
      case 'image':
        total += (n.alt || n.src).length
        break
      case 'br':
        break
    }
  }
  return total
}

export function findAncestors(toc: TocEntry[], id: string): TocEntry[] {
  for (const e of toc) {
    if (e.id === id) return [e]
    const sub = findAncestors(e.children, id)
    if (sub.length) return [e, ...sub]
  }
  return []
}

export function flattenVisible(toc: TocEntry[], expanded: Map<string, boolean>): TocEntry[] {
  const out: TocEntry[] = []
  walk(toc, expanded, out)
  return out
}

function walk(entries: TocEntry[], expanded: Map<string, boolean>, out: TocEntry[]): void {
  for (const e of entries) {
    out.push(e)
    const isExpanded = expanded.get(e.id) ?? defaultExpanded(e)
    if (isExpanded && e.children.length) walk(e.children, expanded, out)
  }
}

function defaultExpanded(e: TocEntry): boolean {
  return e.level <= 2
}
