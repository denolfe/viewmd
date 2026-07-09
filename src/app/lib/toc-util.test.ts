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
