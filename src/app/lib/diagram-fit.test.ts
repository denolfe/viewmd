import { describe, expect, test } from 'bun:test'
import { buildTreeFromTokens, lexMarkdown } from './ast'
import { DIAGRAM_MARGIN_X, codeText } from './diagram-fit'
import { renderDiagramBlocks } from './preprocess'
import type { Node } from './ast'

type CodeNode = Extract<Node, { kind: 'code' }>

// Six-node LR chain: 114 cols at default spacing, 82 at the tightest.
const WIDE_LR = [
  '```mermaid',
  'graph LR',
  '  A[Start here] --> B[Parse markdown] --> C[Build tree] --> D[Render React] --> E[Paint frame] --> F[Done all]',
  '```',
].join('\n')

const codeNode = (md: string): CodeNode => {
  const { nodes } = buildTreeFromTokens(renderDiagramBlocks(lexMarkdown(md)))
  const first = nodes[0]
  if (first?.kind !== 'code') throw new Error(`no code node parsed from: ${md}`)
  return first
}

const widthOf = (text: string) => Math.max(...text.split('\n').map(l => l.length))
const columnFor = (width: number) => width + 2 * DIAGRAM_MARGIN_X

describe('codeText', () => {
  test('plain code returns its value at any width', () => {
    const node = codeNode('```ts\nconst a = 1\n```')
    expect(codeText({ node, breakoutWidth: 5 })).toBe(node.value)
  })

  test('a diagram that fits keeps its default render', () => {
    const node = codeNode(WIDE_LR)
    expect(widthOf(node.value)).toBe(114)
    expect(codeText({ node, breakoutWidth: columnFor(114) })).toBe(node.value)
  })

  test('an overflowing diagram re-renders tighter to fit the column', () => {
    const node = codeNode(WIDE_LR)
    const text = codeText({ node, breakoutWidth: columnFor(100) })
    expect(widthOf(text)).toBeLessThanOrEqual(100)
    expect(text).toContain('Done all')
  })

  test('when nothing fits, the tightest render wins', () => {
    const node = codeNode(WIDE_LR)
    expect(widthOf(codeText({ node, breakoutWidth: columnFor(40) }))).toBe(82)
  })

  test('DOT diagrams fit the same way', () => {
    const node = codeNode('```dot\ndigraph { a -> b -> c -> d -> e -> f -> g -> h -> i -> j }\n```')
    const natural = widthOf(node.value)
    const text = codeText({ node, breakoutWidth: columnFor(natural - 1) })
    expect(widthOf(text)).toBeLessThan(natural)
  })
})
