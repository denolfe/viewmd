import { describe, expect, test } from 'bun:test'
import { createFold, PIN_TOP_OFFSET, childToTopDelta } from './fold'
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

describe('createFold offsetFor', () => {
  const fold = createFold({ toc })

  test('deepest heading: ancestor rows, self excluded', () => {
    // c(L3) under b(L2) under a(L1): a pill + b muted = 2 rows, c filtered.
    expect(fold.offsetFor('c', 0)).toBe(2)
  })

  test('top-level H1 heading: no ancestors -> 0', () => {
    expect(fold.offsetFor('a', 0)).toBe(0)
  })

  test('no H1: synth file row counts toward ancestor height', () => {
    const noH1: TocEntry[] = [
      {
        id: 'y',
        level: 2,
        text: 'Y',
        inline: [],
        children: [{ id: 'z', level: 3, text: 'Z', inline: [], children: [] }],
      },
    ]
    expect(createFold({ toc: noH1, fileLabel: 'README.md' }).offsetFor('z', 0)).toBe(2)
  })

  test('back badge adds one row when history exists', () => {
    expect(fold.offsetFor('c', 2)).toBe(3)
  })
})

describe('createFold aboveOffsetFor', () => {
  const fold = createFold({ toc })

  test('includes the heading own ancestor row (differs from offsetFor by 1)', () => {
    expect(fold.aboveOffsetFor('c')).toBe(3)
    expect(fold.aboveOffsetFor('c') - fold.offsetFor('c', 0)).toBe(1)
  })

  test('top-level H1: only its own ancestor row -> 1', () => {
    expect(fold.aboveOffsetFor('a')).toBe(1)
  })
})

describe('createFold tailReserve', () => {
  const fold = createFold({ toc })

  test('null last heading reserves nothing', () => {
    expect(fold.tailReserve(null, 0)).toBe(0)
  })

  test('reserves the last heading fold offset', () => {
    expect(fold.tailReserve('c', 0)).toBe(2)
    expect(fold.tailReserve('c', 2)).toBe(3)
  })
})

describe('createFold resolveCurrent', () => {
  const fold = createFold({ toc })
  const headingIds = ['a', 'b', 'c', 'd']

  test('empty headingIds resolves to null / empty set', () => {
    const res = fold.resolveCurrent({ geom: makeGeometry(), headingIds: [], historyDepth: 0 })
    expect(res.currentHeadingId).toBeNull()
    expect(res.visibleHeadingIds.size).toBe(0)
  })

  test('heading behind the overlay becomes current and is excluded from visible', () => {
    const geom = makeGeometry({
      positions: { a: { y: -5 }, b: { y: -3 }, c: { y: 0 }, d: { y: 50 } },
    })
    const res = fold.resolveCurrent({ geom, headingIds, historyDepth: 0 })
    expect(res.currentHeadingId).toBe('c')
    expect(res.visibleHeadingIds.has('c')).toBe(false)
  })

  test('bails without looping when the fold offset cycles', () => {
    // Two headings whose folds leapfrog each other could cycle; the seen-offset guard must terminate.
    const geom = makeGeometry({
      positions: { a: { y: 0 }, b: { y: 1 }, c: { y: 2 }, d: { y: 3 } },
    })
    const res = fold.resolveCurrent({ geom, headingIds, historyDepth: 0 })
    expect(res.currentHeadingId).not.toBeNull()
    expect(headingIds).toContain(res.currentHeadingId ?? '')
  })
})

describe('PIN_TOP_OFFSET', () => {
  test('is 1', () => {
    expect(PIN_TOP_OFFSET).toBe(1)
  })
})

describe('createFold resolveAt', () => {
  // The offset is supplied, so no toc is needed to compute one.
  const fold = createFold({ toc: [] })

  test('picks the greatest heading at or above the fold (with PIN slack)', () => {
    // viewportTop 0, topOffset 1 → threshold = 0 + 1 + PIN_TOP_OFFSET(1) = 2.
    const geom = makeGeometry({ positions: { a: { y: -5 }, b: { y: 2 }, c: { y: 10 } } })
    const res = fold.resolveAt({ geom, headingIds: ['a', 'b', 'c'], topOffset: 1 })
    expect(res.currentHeadingId).toBe('b')
  })

  test('falls back to the first heading below when none are at/above', () => {
    const geom = makeGeometry({ positions: { a: { y: 8 }, b: { y: 3 }, c: { y: 12 } } })
    // threshold = 0 + 0 + 1 = 1; all below → smallest y (b at 3).
    const res = fold.resolveAt({ geom, headingIds: ['a', 'b', 'c'], topOffset: 0 })
    expect(res.currentHeadingId).toBe('b')
  })

  test('ignores unmounted headings (findChild null)', () => {
    const geom = makeGeometry({ positions: { a: { y: -1 } } })
    const res = fold.resolveAt({ geom, headingIds: ['a', 'missing'], topOffset: 0 })
    expect(res.currentHeadingId).toBe('a')
  })

  test('includes headings whose box intersects [top, bottom)', () => {
    // top = 0 + topOffset(2) = 2; bottom = 0 + viewportHeight(10) = 10.
    const geom = makeGeometry({
      viewportHeight: 10,
      positions: { above: { y: 1 }, edge: { y: 2 }, mid: { y: 5 }, below: { y: 10 } },
    })
    const res = fold.resolveAt({
      geom,
      headingIds: ['above', 'edge', 'mid', 'below'],
      topOffset: 2,
    })
    // above: bottom 2 > 2? no. edge: bottom 3 > 2 && top 2 < 10 → yes. mid → yes. below: top 10 < 10? no.
    expect([...res.visibleHeadingIds].sort()).toEqual(['edge', 'mid'])
  })

  test('empty headingIds resolves to null / empty set', () => {
    const res = fold.resolveAt({ geom: makeGeometry(), headingIds: [], topOffset: 0 })
    expect(res.currentHeadingId).toBeNull()
    expect(res.visibleHeadingIds.size).toBe(0)
  })
})

describe('childToTopDelta', () => {
  test('delta accounts for viewportTop, PIN_TOP_OFFSET and topOffset', () => {
    const geom = makeGeometry({ viewportTop: 4, positions: { h: { y: 20 } } })
    // 20 - 4 - PIN_TOP_OFFSET(1) - topOffset(3) = 12.
    expect(childToTopDelta(geom, 'h', 3)).toBe(20 - 4 - PIN_TOP_OFFSET - 3)
  })

  test('null when the child is unmounted', () => {
    expect(childToTopDelta(makeGeometry(), 'missing', 0)).toBeNull()
  })
})
