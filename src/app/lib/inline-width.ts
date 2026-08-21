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
 * Styled containers (strong/em/del/link) wrap through their children, and each resulting
 * line re-wears the container, so a styled run never outgrows the measured line count.
 */
export function wrapInline(nodes: InlineNode[], maxWidth: number): InlineNode[][] {
  if (maxWidth <= 0) return [nodes]
  const lines: InlineNode[][] = [[]]
  const openContainers: ContainerNode[] = [] // outermost first
  let used = 0

  const startNewLine = () => {
    lines.push([])
    used = 0
  }

  const append = (piece: InlineNode) => {
    let node = piece
    for (let i = openContainers.length - 1; i >= 0; i--) {
      node = { ...openContainers[i]!, children: [node] }
    }
    pushMerged(lines[lines.length - 1]!, node)
  }

  const pushAtomic = (node: InlineNode, w: number) => {
    if (used > 0 && used + w > maxWidth) startNewLine()
    if (w > maxWidth && (node.kind === 'codespan' || node.kind === 'kbd')) {
      const chunkW = Math.max(1, maxWidth - PILL_GLYPH_WIDTH)
      const value = node.value
      for (let i = 0; i < value.length; i += chunkW) {
        const chunk = value.slice(i, i + chunkW)
        append({ ...node, value: chunk })
        used += stringWidth(chunk) + PILL_GLYPH_WIDTH
        if (i + chunkW < value.length) startNewLine()
      }
      return
    }
    append(node)
    used += w
  }

  const pushTextChunk = (value: string) => {
    if (!value.length) return
    append({ kind: 'text', value })
    used += stringWidth(value)
  }

  const pushText = (value: string) => {
    const parts = value.split(/(\s+)/) // keeps separators
    for (const part of parts) {
      if (!part) continue
      const partWidth = stringWidth(part)
      const isSpace = /^\s+$/.test(part)
      if (isSpace) {
        if (used === 0) continue // drop leading whitespace on new lines
        if (used + partWidth > maxWidth) {
          startNewLine()
          continue
        }
        pushTextChunk(part)
        continue
      }
      if (used + partWidth <= maxWidth) {
        pushTextChunk(part)
        continue
      }
      if (used > 0) startNewLine()
      if (partWidth <= maxWidth) {
        pushTextChunk(part)
        continue
      }
      // word longer than maxWidth: hard-break at display width
      const chunks = splitToWidth(part, maxWidth)
      chunks.forEach((chunk, i) => {
        pushTextChunk(chunk)
        if (i < chunks.length - 1) startNewLine()
      })
    }
  }

  const pushNode = (n: InlineNode) => {
    if (n.kind === 'text') {
      pushText(n.value)
      return
    }
    if (n.kind === 'br') {
      startNewLine()
      return
    }
    if (isContainer(n)) {
      openContainers.push(n)
      for (const child of n.children) pushNode(child)
      openContainers.pop()
      return
    }
    pushAtomic(n, nodeVisibleWidth(n))
  }

  for (const n of nodes) pushNode(n)
  return lines
}

type ContainerNode = Extract<InlineNode, { children: InlineNode[] }>

function isContainer(n: InlineNode): n is ContainerNode {
  return n.kind === 'strong' || n.kind === 'em' || n.kind === 'del' || n.kind === 'link'
}

/** Appends `node`, folding it into the previous sibling when both are the same container. */
function pushMerged(line: InlineNode[], node: InlineNode) {
  const last = line[line.length - 1]
  if (last && isContainer(last) && isContainer(node) && isSameContainer(last, node)) {
    for (const child of node.children) pushMerged(last.children, child)
    return
  }
  line.push(node)
}

function isSameContainer(a: ContainerNode, b: ContainerNode): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'link' && b.kind === 'link') return a.href === b.href
  return true
}

/** Splits a word into chunks no wider than `maxWidth` display columns. */
function splitToWidth(word: string, maxWidth: number): string[] {
  const chunks: string[] = []
  let chunk = ''
  let width = 0
  for (const ch of word) {
    const w = stringWidth(ch)
    if (width + w > maxWidth && chunk) {
      chunks.push(chunk)
      chunk = ''
      width = 0
    }
    chunk += ch
    width += w
  }
  if (chunk) chunks.push(chunk)
  return chunks
}
