import { describe, expect, test } from 'bun:test'
import { buildTree } from './ast'
import { renderAnsi } from './renderAnsi'
import {
  estimateNodeRows,
  estimateTotalRows,
  initialMountCount,
  sliceCountForRows,
} from './progressive'
import type { Node } from './ast'

const WIDTH = 80

const node = (md: string): Node => {
  const { nodes } = buildTree(md)
  const first = nodes[0]
  if (!first) throw new Error(`no node parsed from: ${md}`)
  return first
}

describe('estimateNodeRows', () => {
  test('space and hr are 1 row', () => {
    expect(estimateNodeRows({ kind: 'space' }, WIDTH)).toBe(1)
    expect(estimateNodeRows({ kind: 'hr' }, WIDTH)).toBe(1)
  })

  test('heading is 2 rows', () => {
    expect(estimateNodeRows(node('# Title'), WIDTH)).toBe(2)
    expect(estimateNodeRows(node('### Deep'), WIDTH)).toBe(2)
  })

  test('paragraph is ceil(visible width / contentWidth)', () => {
    expect(estimateNodeRows(node('short'), WIDTH)).toBe(1)
    // 200 chars at width 80 → 3 lines
    expect(estimateNodeRows(node('x'.repeat(200)), WIDTH)).toBe(3)
  })

  test('code block is line count + 4 (border + padding)', () => {
    expect(estimateNodeRows(node('```ts\na\nb\nc\n```'), WIDTH)).toBe(7)
  })

  test('mermaid code block is raw line count (rendered bare)', () => {
    const n: Node = { kind: 'code', lang: 'mermaid', value: 'a\nb\nc' }
    expect(estimateNodeRows(n, WIDTH)).toBe(3)
  })

  test('table is row count + 3', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |'
    expect(estimateNodeRows(node(md), WIDTH)).toBe(5) // 2 rows + 3
  })

  test('list sums item children, min 1 per item', () => {
    expect(estimateNodeRows(node('- one\n- two\n- three'), WIDTH)).toBe(3)
  })

  test('blockquote recurses children', () => {
    expect(estimateNodeRows(node('> quoted line'), WIDTH)).toBe(1)
  })

  test('html and image are at least 1 row', () => {
    expect(estimateNodeRows({ kind: 'image', alt: 'a', src: 's' }, WIDTH)).toBe(1)
    expect(estimateNodeRows({ kind: 'html', value: '<b>x</b>' }, WIDTH)).toBe(1)
  })
})

describe('low bias against real render', () => {
  test('estimateTotalRows(exhaustive) <= actual rendered rows', async () => {
    const md = await Bun.file(new URL('../../../test/exhaustive.md', import.meta.url)).text()
    const { nodes } = buildTree(md)
    const out = await renderAnsi({ nodes, width: 100, maxHeight: 2000 })
    const actualRows = out.split('\n').length
    expect(estimateTotalRows(nodes, 100)).toBeLessThanOrEqual(actualRows)
  }, 30000)
})

describe('sliceCountForRows', () => {
  const paragraphs: Node[] = Array.from({ length: 20 }, () => ({
    kind: 'paragraph',
    inline: [{ kind: 'text', value: 'row' }],
  }))

  test('returns smallest count reaching the target rows', () => {
    // each paragraph estimates 1 row
    expect(sliceCountForRows({ nodes: paragraphs, contentWidth: WIDTH, rows: 5 })).toBe(5)
  })

  test('returns full length when target exceeds the doc', () => {
    expect(sliceCountForRows({ nodes: paragraphs, contentWidth: WIDTH, rows: 999 })).toBe(20)
  })

  test('initialMountCount covers 2x viewport height', () => {
    expect(initialMountCount({ nodes: paragraphs, contentWidth: WIDTH, viewportHeight: 6 })).toBe(
      12,
    )
  })
})
