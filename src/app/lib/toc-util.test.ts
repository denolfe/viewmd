import { describe, expect, test } from 'bun:test'
import {
  buildBreadcrumbs,
  findAncestors,
  findCurrent,
  flattenVisible,
  inlineVisibleWidth,
  maxTocDepth,
  tocContentWidth,
} from './toc-util'
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

describe('buildBreadcrumbs', () => {
  test('null current heading -> empty chain', () => {
    expect(buildBreadcrumbs(toc, null)).toEqual([])
  })
  test('chain root->current carries id, inline, indent', () => {
    expect(buildBreadcrumbs(toc, 'c')).toEqual([
      { id: 'a', inline: [], indent: 0 },
      { id: 'b', inline: [], indent: 2 },
      { id: 'c', inline: [], indent: 4 },
    ])
  })
  test('passes ancestor inline nodes through verbatim', () => {
    const linked: TocEntry[] = [
      {
        id: 'x',
        level: 1,
        text: 'Setup',
        inline: [{ kind: 'link', href: './s.md', children: [{ kind: 'text', value: 'Setup' }] }],
        children: [],
      },
    ]
    expect(buildBreadcrumbs(linked, 'x')).toEqual([
      {
        id: 'x',
        inline: [{ kind: 'link', href: './s.md', children: [{ kind: 'text', value: 'Setup' }] }],
        indent: 0,
      },
    ])
  })
  test('empty toc -> empty chain', () => {
    expect(buildBreadcrumbs([], null)).toEqual([])
  })
})

describe('maxTocDepth', () => {
  test('three-level tree', () => {
    expect(maxTocDepth(toc)).toBe(3)
  })
  test('flat list', () => {
    expect(maxTocDepth([{ id: 'a', level: 1, text: 'A', inline: [], children: [] }])).toBe(1)
  })
  test('empty toc -> 0', () => {
    expect(maxTocDepth([])).toBe(0)
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
