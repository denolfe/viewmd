import { describe, expect, test } from 'bun:test'
import { foldOffset, aboveOffset, resolveHeadings } from './heading-resolution'
import { makeGeometry } from './viewport-geometry.testutil'
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

describe('foldOffset', () => {
  test('deepest heading: ancestor crumbs, self excluded', () => {
    // c(L3) under b(L2) under a(L1): a pill + b muted = 2 rows, c filtered.
    expect(foldOffset({ toc, id: 'c', historyDepth: 0 })).toBe(2)
  })

  test('top-level H1 heading: no ancestors -> 0', () => {
    expect(foldOffset({ toc, id: 'a', historyDepth: 0 })).toBe(0)
  })

  test('no H1: synth file row counts toward ancestor height', () => {
    const noH1Toc: TocEntry[] = [
      {
        id: 'y',
        level: 2,
        text: 'Y',
        inline: [],
        children: [{ id: 'z', level: 3, text: 'Z', inline: [], children: [] }],
      },
    ]
    expect(foldOffset({ toc: noH1Toc, id: 'z', fileLabel: 'README.md', historyDepth: 0 })).toBe(2)
  })

  test('back badge adds one row when history exists', () => {
    expect(foldOffset({ toc, id: 'c', historyDepth: 2 })).toBe(3)
  })
})

describe('aboveOffset', () => {
  test('includes the heading own crumb (differs from foldOffset by 1)', () => {
    // fold excludes self (2); above includes c -> 3.
    expect(aboveOffset({ toc, id: 'c' })).toBe(3)
    expect(aboveOffset({ toc, id: 'c' }) - foldOffset({ toc, id: 'c', historyDepth: 0 })).toBe(1)
  })

  test('top-level H1: only its own crumb -> 1', () => {
    expect(aboveOffset({ toc, id: 'a' })).toBe(1)
  })
})

describe('resolveHeadings', () => {
  const headingIds = ['a', 'b', 'c', 'd']

  test('empty headingIds resolves to null / empty set', () => {
    const geom = makeGeometry()
    const res = resolveHeadings({ geom, toc, headingIds: [], historyDepth: 0 })
    expect(res.currentHeadingId).toBeNull()
    expect(res.visibleHeadingIds.size).toBe(0)
  })

  test('heading behind the overlay becomes current and is excluded from visible', () => {
    // a (H1) scrolled above; c (L3 under a>b) sits at row 0, behind the overlay
    // (its fold offset is 2); d far below. The fixed point must make c current
    // and drop it from the visible set so it renders as a crumb, not a ghost.
    const geom = makeGeometry({
      positions: { a: { y: -5 }, b: { y: -3 }, c: { y: 0 }, d: { y: 50 } },
    })
    const res = resolveHeadings({ geom, toc, headingIds, historyDepth: 0 })
    expect(res.currentHeadingId).toBe('c')
    expect(res.visibleHeadingIds.has('c')).toBe(false)
  })

  test('bails without looping when the fold offset cycles', () => {
    // Two headings whose folds leapfrog each other could cycle; the seen-offset
    // guard must terminate. Assert it returns (does not hang) and picks one.
    const geom = makeGeometry({
      positions: { a: { y: 0 }, b: { y: 1 }, c: { y: 2 }, d: { y: 3 } },
    })
    const res = resolveHeadings({ geom, toc, headingIds, historyDepth: 0 })
    expect(res.currentHeadingId).not.toBeNull()
    expect(headingIds).toContain(res.currentHeadingId ?? '')
  })
})
