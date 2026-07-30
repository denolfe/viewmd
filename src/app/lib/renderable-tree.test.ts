import { describe, expect, test } from 'bun:test'
import { collectById, collectTextBearers } from './renderable-tree'

/**
 * Renderable stand-in. Field types are deliberately `unknown` so tests can feed
 * wrong-typed values through the same door a real renderable would use.
 * `getChildren` records the visit, which is how pruning becomes observable.
 */
type FakeNode = {
  id?: string
  y?: unknown
  height?: unknown
  plainText?: unknown
  lineInfo?: unknown
  getChildren(): unknown[]
}

function node(
  props: {
    id?: string
    y?: unknown
    height?: unknown
    plainText?: unknown
    lineInfo?: unknown
    children?: unknown[]
    visits?: string[]
  } = {},
): FakeNode {
  const children = props.children ?? []
  return {
    ...props,
    getChildren: () => {
      props.visits?.push(props.id ?? '<root>')
      return children
    },
  }
}

/** A well-formed text bearer: string `plainText`, number `y`, array `lineStartCols`. */
function bearer(y: number, plainText: string): FakeNode {
  return node({ y, plainText, lineInfo: { lineStartCols: [0] } })
}

describe('collectById', () => {
  test('applies collect to every wanted id beneath the root', () => {
    const root = node({
      children: [
        node({ id: 'a', y: 10, height: 2 }),
        node({ children: [node({ id: 'b', y: 20, height: 3 })] }),
      ],
    })
    const out = collectById({
      root,
      wanted: new Set(['a', 'b']),
      collect: n => ({ y: n.y ?? 0, height: n.height ?? 0 }),
    })
    expect(out.size).toBe(2)
    expect(out.get('a')).toEqual({ y: 10, height: 2 })
    expect(out.get('b')).toEqual({ y: 20, height: 3 })
  })

  test('does not descend into a matched node', () => {
    // Block ids never nest inside one another, so a matched box is a leaf to the walk.
    const root = node({
      children: [node({ id: 'outer', y: 1, children: [node({ id: 'inner', y: 2 })] })],
    })
    const out = collectById({
      root,
      wanted: new Set(['outer', 'inner']),
      collect: n => n.y ?? 0,
    })
    expect(out.get('outer')).toBe(1)
    expect(out.has('inner')).toBe(false)
  })

  test('stops walking once every wanted id is found', () => {
    const visits: string[] = []
    const root = node({
      visits,
      children: [
        node({ id: 'a', y: 1, visits }),
        node({ id: 'deep', visits, children: [node({ id: 'unwanted', visits })] }),
      ],
    })
    collectById({ root, wanted: new Set(['a']), collect: n => n.y ?? 0 })
    // 'a' empties the set, so the loop bails before entering 'deep'.
    expect(visits).toEqual(['<root>'])
  })

  test('skips children that are not tree nodes', () => {
    const root = { getChildren: () => [null, 'text', 42, node({ id: 'a', y: 7 })] }
    const out = collectById({ root, wanted: new Set(['a']), collect: n => n.y ?? 0 })
    expect(out.get('a')).toBe(7)
  })
})

describe('collectTextBearers', () => {
  test('returns self without descending when the node is itself a bearer', () => {
    const visits: string[] = []
    const self = node({
      id: 'b',
      y: 5,
      plainText: 'hi',
      lineInfo: { lineStartCols: [0] },
      visits,
      children: [bearer(9, 'nested')],
    })
    const out = collectTextBearers(self, [])
    expect(out).toHaveLength(1)
    expect(out[0]?.plainText).toBe('hi')
    expect(visits).toEqual([])
  })

  test('gathers bearers in tree order across nested blocks', () => {
    const root = node({
      children: [
        node({ children: [bearer(1, 'one')] }),
        bearer(2, 'two'),
        node({ children: [node({ children: [bearer(3, 'three')] })] }),
      ],
    })
    expect(collectTextBearers(root, []).map(b => b.plainText)).toEqual(['one', 'two', 'three'])
  })

  test('rejects near-bearers whose field types are wrong', () => {
    const candidates: FakeNode[] = [
      node({ y: 1, plainText: 'x' }),
      node({ y: 1, plainText: 'x', lineInfo: {} }),
      node({ y: 1, plainText: 'x', lineInfo: { lineStartCols: 'nope' } }),
      node({ y: 1, plainText: 7, lineInfo: { lineStartCols: [0] } }),
      node({ y: 'nope', plainText: 'x', lineInfo: { lineStartCols: [0] } }),
    ]
    for (const candidate of candidates) {
      expect(collectTextBearers(node({ children: [candidate] }), [])).toEqual([])
    }
  })
})
