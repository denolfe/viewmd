import { describe, expect, test } from 'bun:test'
import { findCurrent, flattenVisible, inlineVisibleWidth, tocContentWidth } from './toc-util'
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

describe('inlineVisibleWidth', () => {
  test('plain text length', () => {
    expect(inlineVisibleWidth([{ kind: 'text', value: 'hello' }])).toBe(5)
  })
  test('codespan adds 2 for pill glyphs', () => {
    expect(inlineVisibleWidth([{ kind: 'codespan', value: 'foo' }])).toBe(5)
  })
  test('mixed text + codespan', () => {
    expect(
      inlineVisibleWidth([
        { kind: 'text', value: 'Use ' },
        { kind: 'codespan', value: 'foo' },
      ]),
    ).toBe(9)
  })
  test('recurses strong children', () => {
    expect(
      inlineVisibleWidth([{ kind: 'strong', children: [{ kind: 'text', value: 'abcd' }] }]),
    ).toBe(4)
  })
})

describe('tocContentWidth', () => {
  test('accounts for indent, marker, and inline width', () => {
    const toc: TocEntry[] = [
      {
        id: 'a',
        level: 1,
        text: 'A',
        inline: [{ kind: 'text', value: 'A' }],
        children: [
          {
            id: 'b',
            level: 2,
            text: 'Use foo',
            inline: [
              { kind: 'text', value: 'Use ' },
              { kind: 'codespan', value: 'foo' },
            ],
            children: [],
          },
        ],
      },
    ]
    // entry a: 2*0 + 2 + 1 = 3 ; entry b: 2*1 + 2 + (4 + 5) = 13
    expect(tocContentWidth(toc)).toBe(13)
  })
  test('empty tree is 0', () => {
    expect(tocContentWidth([])).toBe(0)
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

describe('findCurrent', () => {
  test('null id -> null', () => {
    expect(findCurrent(toc, null)).toBeNull()
  })
  test('top-level id -> matching entry', () => {
    const e = findCurrent(toc, 'a')
    expect(e?.id).toBe('a')
    expect(e?.level).toBe(1)
  })
  test('nested id -> matching entry', () => {
    const e = findCurrent(toc, 'c')
    expect(e?.id).toBe('c')
    expect(e?.level).toBe(3)
  })
  test('missing id -> null', () => {
    expect(findCurrent(toc, 'nope')).toBeNull()
  })
  test('empty toc -> null', () => {
    expect(findCurrent([], 'a')).toBeNull()
  })
})
