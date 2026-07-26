import { describe, expect, test } from 'bun:test'
import {
  findToc,
  flattenVisible,
  tocContentWidth,
  tocVisibleContentWidth,
  toggleTocExpanded,
  walkToc,
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

describe('tocVisibleContentWidth', () => {
  // a > b > c(wide), d — c is the widest but lives under b.
  const wide: TocEntry[] = [
    {
      id: 'a',
      level: 1,
      text: 'A',
      inline: [{ kind: 'text', value: 'A' }],
      children: [
        {
          id: 'b',
          level: 2,
          text: 'B',
          inline: [{ kind: 'text', value: 'B' }],
          children: [
            {
              id: 'c',
              level: 3,
              text: 'wide label here',
              inline: [{ kind: 'text', value: 'wide label here' }],
              children: [],
            },
          ],
        },
      ],
    },
    { id: 'd', level: 1, text: 'D', inline: [{ kind: 'text', value: 'D' }], children: [] },
  ]

  test('all expanded matches the full-tree width', () => {
    expect(tocVisibleContentWidth(wide, new Map())).toBe(tocContentWidth(wide))
  })

  test('collapsing the subtree holding the widest entry narrows the result', () => {
    // c: 2*(3-1) + 2 + 15 = 21 (widest). With b collapsed, widest visible is
    // b: 2*(2-1) + 2 + 1 = 5.
    expect(tocVisibleContentWidth(wide, new Map())).toBe(21)
    expect(tocVisibleContentWidth(wide, new Map([['b', false]]))).toBe(5)
  })

  test('empty tree is 0', () => {
    expect(tocVisibleContentWidth([], new Map())).toBe(0)
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
  test('default-expanded at every level', () => {
    const exp = new Map<string, boolean>()
    expect(flattenVisible(toc, exp).map(e => e.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('toggleTocExpanded', () => {
  const deepToc: TocEntry[] = [
    {
      id: 'h2',
      level: 2,
      text: 'H2',
      inline: [],
      children: [
        {
          id: 'h3',
          level: 3,
          text: 'H3',
          inline: [],
          children: [{ id: 'h4', level: 4, text: 'H4', inline: [], children: [] }],
        },
      ],
    },
  ]

  test('h4 under an h3 is visible with no explicit toggles', () => {
    expect(flattenVisible(deepToc, new Map()).map(e => e.id)).toEqual(['h2', 'h3', 'h4'])
  })

  test('first toggle on an h3 collapses it, hiding its h4 child', () => {
    const next = toggleTocExpanded({ toc: deepToc, expanded: new Map(), id: 'h3' })
    expect(next.get('h3')).toBe(false)
    expect(flattenVisible(deepToc, next).map(e => e.id)).toEqual(['h2', 'h3'])
  })

  test('toggle twice restores the default state', () => {
    const once = toggleTocExpanded({ toc: deepToc, expanded: new Map(), id: 'h3' })
    const twice = toggleTocExpanded({ toc: deepToc, expanded: once, id: 'h3' })
    expect(flattenVisible(deepToc, twice).map(e => e.id)).toEqual(['h2', 'h3', 'h4'])
  })

  test('unknown id -> unchanged map', () => {
    const exp = new Map([['h2', false]])
    expect(toggleTocExpanded({ toc: deepToc, expanded: exp, id: 'nope' })).toBe(exp)
  })
})

describe('walkToc', () => {
  test('pre-order traversal with depths', () => {
    const seen: Array<[string, number]> = []
    walkToc(toc, (e, d) => seen.push([e.id, d]))
    expect(seen).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 0],
    ])
  })
})

describe('findToc', () => {
  test('returns the first match in pre-order', () => {
    expect(findToc(toc, e => e.id === 'c')?.id).toBe('c')
    expect(findToc(toc, e => e.level === 1)?.id).toBe('a')
  })
  test('returns null when no match', () => {
    expect(findToc(toc, () => false)).toBeNull()
  })
})
