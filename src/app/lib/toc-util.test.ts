import { describe, expect, test } from 'bun:test'
import {
  ancestorChain,
  breadcrumbHeightForHeading,
  breadcrumbRows,
  FILE_ROW_ID,
  findCurrent,
  findToc,
  flattenVisible,
  inlineVisibleWidth,
  tocContentWidth,
  tocVisibleContentWidth,
  toggleTocExpanded,
  truncateLabelLeft,
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

describe('truncateLabelLeft', () => {
  test('returns label unchanged when it fits', () => {
    expect(truncateLabelLeft('docs/README.md', 20)).toBe('docs/README.md')
  })
  test('left-truncates with ellipsis, keeping the filename tail', () => {
    expect(truncateLabelLeft('long-parent-dir/README.md', 12)).toBe('…r/README.md')
  })
  test('result never exceeds maxWidth', () => {
    expect(truncateLabelLeft('abcdef', 3)).toHaveLength(3)
  })
  test('degenerate widths', () => {
    expect(truncateLabelLeft('abc', 1)).toBe('…')
    expect(truncateLabelLeft('abc', 0)).toBe('')
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

describe('ancestorChain', () => {
  test('null id -> empty', () => {
    expect(ancestorChain(toc, null)).toEqual([])
  })
  test('unknown id -> empty', () => {
    expect(ancestorChain(toc, 'nope')).toEqual([])
  })
  test('root id -> single entry', () => {
    expect(ancestorChain(toc, 'a').map(e => e.id)).toEqual(['a'])
  })
  test('nested id -> full lineage root..target', () => {
    expect(ancestorChain(toc, 'c').map(e => e.id)).toEqual(['a', 'b', 'c'])
  })
  test('sibling root -> just itself', () => {
    expect(ancestorChain(toc, 'd').map(e => e.id)).toEqual(['d'])
  })
})

describe('breadcrumbRows', () => {
  const chainA = ancestorChain(toc, 'c') // [a(L1), b(L2), c(L3)]

  test('all visible -> empty (start-empty rule)', () => {
    const rows = breadcrumbRows({
      chain: chainA,
      visibleHeadingIds: new Set(['a', 'b', 'c']),
      hasH1: true,
    })
    expect(rows).toEqual([])
  })

  test('H1 root -> pill, deeper -> muted with level', () => {
    const rows = breadcrumbRows({
      chain: chainA,
      visibleHeadingIds: new Set(['c']),
      hasH1: true,
    })
    expect(rows).toEqual([
      { id: 'a', variant: 'pill', inline: [] },
      { id: 'b', variant: 'muted', level: 2, inline: [] },
    ])
  })

  test('no H1: synth root pill prepended when a crumb survives', () => {
    const rows = breadcrumbRows({
      chain: chainA,
      visibleHeadingIds: new Set(['c']),
      hasH1: false,
      fileLabel: 'README.md',
    })
    expect(rows[0]).toEqual({
      id: FILE_ROW_ID,
      variant: 'pill',
      inline: [{ kind: 'text', value: 'README.md' }],
    })
    expect(rows.slice(1).map(r => r.id)).toEqual(['a', 'b'])
  })

  test('no H1: synth root suppressed when nothing survives', () => {
    const rows = breadcrumbRows({
      chain: chainA,
      visibleHeadingIds: new Set(['a', 'b', 'c']),
      hasH1: false,
      fileLabel: 'README.md',
    })
    expect(rows).toEqual([])
  })
})

describe('breadcrumbHeightForHeading', () => {
  test('deepest heading: ancestor crumbs, self excluded', () => {
    // c(L3) under b(L2) under a(L1); a is a pill, b muted -> 2 rows, c filtered.
    expect(breadcrumbHeightForHeading({ toc, id: 'c' })).toBe(2)
  })

  test('top-level H1 heading: no ancestors -> 0', () => {
    expect(breadcrumbHeightForHeading({ toc, id: 'a' })).toBe(0)
  })

  test('no H1: synth file row counts toward ancestor height', () => {
    // No H1, so the file label prepends a row: z gains file + y(L2) = 2.
    const noH1Toc: TocEntry[] = [
      {
        id: 'y',
        level: 2,
        text: 'Y',
        inline: [],
        children: [{ id: 'z', level: 3, text: 'Z', inline: [], children: [] }],
      },
    ]
    expect(breadcrumbHeightForHeading({ toc: noH1Toc, id: 'z', fileLabel: 'README.md' })).toBe(2)
  })
})
