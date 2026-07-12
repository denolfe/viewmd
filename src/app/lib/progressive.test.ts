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

  test('html and image are 1 row', () => {
    expect(estimateNodeRows({ kind: 'image', alt: 'a', src: 's' }, WIDTH)).toBe(1)
    expect(estimateNodeRows({ kind: 'html', value: '<b>x</b>' }, WIDTH)).toBe(1)
    // HtmlBlock collapses multi-line markup into a single wrapped <text>.
    expect(estimateNodeRows({ kind: 'html', value: '<p>\n<b>x</b>\n</p>' }, WIDTH)).toBe(1)
  })
})

describe('per-kind low bias against real render', () => {
  /** Rows the block occupies: sandwich it between sentinel paragraphs and diff renders. */
  const occupiedRows = async (
    blockMd: string,
    kind: Node['kind'],
  ): Promise<{ block: Node; rows: number }> => {
    const base = buildTree('TOP\n\nBOTTOM')
    const withBlock = buildTree(`TOP\n\n${blockMd}\n\nBOTTOM`)
    const block = withBlock.nodes.find(n => n.kind === kind)
    if (!block) throw new Error(`no ${kind} node parsed from: ${blockMd}`)
    const a = await renderAnsi({ nodes: base.nodes, width: WIDTH, maxHeight: 500 })
    const b = await renderAnsi({ nodes: withBlock.nodes, width: WIDTH, maxHeight: 500 })
    return { block, rows: b.split('\n').length - a.split('\n').length }
  }

  test('multi-line html block estimate <= actual rows', async () => {
    const md = [
      '<p>',
      '  <a href="https://a"><img alt="A" src="https://a.svg" /></a>',
      '  <a href="https://b"><img alt="B" src="https://b.svg" /></a>',
      '</p>',
    ].join('\n')
    const { block, rows } = await occupiedRows(md, 'html')
    expect(estimateNodeRows(block, WIDTH)).toBeLessThanOrEqual(rows)
  }, 30000)

  test('details estimate <= actual rows', async () => {
    const md = '<details>\n<summary>More</summary>\n\nhidden para\n\n</details>'
    const { block, rows } = await occupiedRows(md, 'details')
    expect(estimateNodeRows(block, WIDTH)).toBeLessThanOrEqual(rows)
  }, 30000)
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
