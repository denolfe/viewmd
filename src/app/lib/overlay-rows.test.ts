import { describe, expect, test } from 'bun:test'
import { ancestorChain, ancestorRows, documentHasH1, FILE_ROW_ID } from './overlay-rows'
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

describe('documentHasH1', () => {
  test('detects an H1 that is not the first heading', () => {
    const later: TocEntry[] = [
      { id: 'intro', level: 2, text: 'Intro', inline: [], children: [] },
      {
        id: 'title',
        level: 1,
        text: 'Title',
        inline: [],
        children: [{ id: 'sub', level: 2, text: 'Sub', inline: [], children: [] }],
      },
    ]
    expect(documentHasH1(later)).toBe(true)
  })

  test('false with no H1, true when first entry is H1', () => {
    expect(documentHasH1([{ id: 'a', level: 2, text: 'A', inline: [], children: [] }])).toBe(false)
    expect(documentHasH1([{ id: 'a', level: 1, text: 'A', inline: [], children: [] }])).toBe(true)
  })

  test('empty toc -> false', () => {
    expect(documentHasH1([])).toBe(false)
  })
})

describe('ancestorRows', () => {
  const chainA = ancestorChain(toc, 'c') // [a(L1), b(L2), c(L3)]

  test('all visible -> empty (start-empty rule)', () => {
    const rows = ancestorRows({
      chain: chainA,
      visibleHeadingIds: new Set(['a', 'b', 'c']),
      hasH1: true,
    })
    expect(rows).toEqual([])
  })

  test('H1 root -> pill, deeper -> muted with level', () => {
    const rows = ancestorRows({
      chain: chainA,
      visibleHeadingIds: new Set(['c']),
      hasH1: true,
    })
    expect(rows).toEqual([
      { id: 'a', variant: 'pill', inline: [] },
      { id: 'b', variant: 'muted', level: 2, inline: [] },
    ])
  })

  test('no H1: synth root pill prepended when an ancestor row survives', () => {
    const rows = ancestorRows({
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
    const rows = ancestorRows({
      chain: chainA,
      visibleHeadingIds: new Set(['a', 'b', 'c']),
      hasH1: false,
      fileLabel: 'README.md',
    })
    expect(rows).toEqual([])
  })

  test('H1 that follows an earlier heading still renders as a pill with no file label', () => {
    const laterH1Toc: TocEntry[] = [
      { id: 'intro', level: 2, text: 'Intro', inline: [], children: [] },
      { id: 'title', level: 1, text: 'Title', inline: [], children: [] },
    ]
    const title = laterH1Toc[1]
    if (!title) throw new Error('expected title entry')
    const rows = ancestorRows({
      chain: [title],
      visibleHeadingIds: new Set(),
      hasH1: documentHasH1(laterH1Toc),
      fileLabel: 'file.md',
    })
    expect(rows.some(r => r.id === 'title' && r.variant === 'pill')).toBe(true)
    expect(rows.some(r => r.variant === 'pill' && r.id !== 'title')).toBe(false)
  })
})
