import type { InlineNode } from './ast'

export const PILL_GLYPH_WIDTH = 2 // ▐ and ▌ edge characters

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
      case 'del':
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
