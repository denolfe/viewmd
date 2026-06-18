import { describe, expect, test } from 'bun:test'
import { findAncestors, flattenVisible } from './toc-util'
import type { TocEntry } from './ast'

const toc: TocEntry[] = [
  {
    id: 'a',
    level: 1,
    text: 'A',
    inline: [],
    children: [
      {
        id: 'b',
        level: 2,
        text: 'B',
        inline: [],
        children: [{ id: 'c', level: 3, text: 'C', inline: [], children: [] }],
      },
    ],
  },
  { id: 'd', level: 1, text: 'D', inline: [], children: [] },
]

describe('findAncestors', () => {
  test('returns chain from root to entry', () => {
    expect(findAncestors(toc, 'c').map(e => e.id)).toEqual(['a', 'b', 'c'])
  })
  test('root entry', () => {
    expect(findAncestors(toc, 'a').map(e => e.id)).toEqual(['a'])
  })
  test('missing id returns empty', () => {
    expect(findAncestors(toc, 'zzz')).toEqual([])
  })
})

describe('flattenVisible', () => {
  test('all expanded -> all entries', () => {
    const exp = new Map([
      ['a', true],
      ['b', true],
      ['c', true],
      ['d', true],
    ])
    expect(flattenVisible(toc, exp).map(e => e.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  test('collapsed parent hides children', () => {
    const exp = new Map([
      ['a', false],
      ['d', true],
    ])
    expect(flattenVisible(toc, exp).map(e => e.id)).toEqual(['a', 'd'])
  })
  test('default-expanded for levels <= 2', () => {
    const exp = new Map<string, boolean>()
    // a (L1) default-expanded -> b visible
    // b (L2) default-expanded -> c visible
    // c is a leaf; d (L1) default-expanded but has no children
    expect(flattenVisible(toc, exp).map(e => e.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
