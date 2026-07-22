import type { InlineNode } from './ast'
import { stringWidth } from './char-width'
import { imageLabelText } from './visible-text'

export const PILL_GLYPH_WIDTH = 2 // ▐ and ▌ edge characters

export function nodeVisibleWidth(n: InlineNode): number {
  switch (n.kind) {
    case 'text':
      return stringWidth(n.value)
    case 'codespan':
    case 'kbd':
      return stringWidth(n.value) + PILL_GLYPH_WIDTH
    case 'strong':
    case 'em':
    case 'link':
    case 'del':
      return inlineVisibleWidth(n.children)
    case 'image':
      return stringWidth(imageLabelText(n.alt, n.src))
    case 'br':
      return 0
  }
}

export function inlineVisibleWidth(nodes: InlineNode[]): number {
  let total = 0
  for (const n of nodes) total += nodeVisibleWidth(n)
  return total
}

/**
 * Wraps a sequence of inline nodes into lines, each ≤ `maxWidth` columns where possible.
 * Breaks text at whitespace; atomic nodes (codespan/kbd/image) move to a new line if they
 * would overflow the current one. Atomic nodes wider than `maxWidth` get their own line.
 */
export function wrapInline(nodes: InlineNode[], maxWidth: number): InlineNode[][] {
  if (maxWidth <= 0) return [nodes]
  const lines: InlineNode[][] = [[]]
  let used = 0

  const startNewLine = () => {
    lines.push([])
    used = 0
  }

  const pushAtomic = (node: InlineNode, w: number) => {
    if (used > 0 && used + w > maxWidth) startNewLine()
    if (w > maxWidth && (node.kind === 'codespan' || node.kind === 'kbd')) {
      const chunkW = Math.max(1, maxWidth - PILL_GLYPH_WIDTH)
      const value = node.value
      for (let i = 0; i < value.length; i += chunkW) {
        const chunk = value.slice(i, i + chunkW)
        const piece = { ...node, value: chunk }
        lines[lines.length - 1]!.push(piece)
        used += chunk.length + PILL_GLYPH_WIDTH
        if (i + chunkW < value.length) startNewLine()
      }
      return
    }
    lines[lines.length - 1]!.push(node)
    used += w
  }

  const pushTextChunk = (value: string) => {
    if (!value.length) return
    lines[lines.length - 1]!.push({ kind: 'text', value })
    used += value.length
  }

  const pushText = (value: string) => {
    const parts = value.split(/(\s+)/) // keeps separators
    for (const part of parts) {
      if (!part) continue
      const isSpace = /^\s+$/.test(part)
      if (isSpace) {
        if (used === 0) continue // drop leading whitespace on new lines
        if (used + part.length > maxWidth) {
          startNewLine()
          continue
        }
        pushTextChunk(part)
        continue
      }
      if (used + part.length <= maxWidth) {
        pushTextChunk(part)
        continue
      }
      if (used > 0) startNewLine()
      if (part.length <= maxWidth) {
        pushTextChunk(part)
        continue
      }
      // word longer than maxWidth: hard-break
      for (let i = 0; i < part.length; i += maxWidth) {
        const chunk = part.slice(i, i + maxWidth)
        pushTextChunk(chunk)
        if (i + maxWidth < part.length) startNewLine()
      }
    }
  }

  for (const n of nodes) {
    if (n.kind === 'text') {
      pushText(n.value)
    } else if (n.kind === 'br') {
      startNewLine()
    } else {
      pushAtomic(n, nodeVisibleWidth(n))
    }
  }
  return lines
}
