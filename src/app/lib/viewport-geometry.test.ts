import { describe, expect, test } from 'bun:test'
import {
  PIN_TOP_OFFSET,
  childToTopDelta,
  findHeadingNearTop,
  findVisibleHeadingIds,
  matchScrollDelta,
  resolveMatchY,
  resolveScrollMarks,
} from './viewport-geometry'
import { makeGeometry } from './viewport-geometry.testutil'
import { matchJumpDelta } from './match-nav'
import type { BlockProjection } from './visible-text'
import type { Match } from './search'

describe('findHeadingNearTop', () => {
  test('picks the greatest heading at or above the fold (with PIN slack)', () => {
    // viewportTop 0, topOffset 1 → threshold = 0 + 1 + PIN_TOP_OFFSET(1) = 2.
    const geom = makeGeometry({ positions: { a: { y: -5 }, b: { y: 2 }, c: { y: 10 } } })
    expect(findHeadingNearTop(geom, ['a', 'b', 'c'], 1)).toBe('b')
  })

  test('falls back to the first heading below when none are at/above', () => {
    const geom = makeGeometry({ positions: { a: { y: 8 }, b: { y: 3 }, c: { y: 12 } } })
    // threshold = 0 + 0 + 1 = 1; all below → smallest y (b at 3).
    expect(findHeadingNearTop(geom, ['a', 'b', 'c'], 0)).toBe('b')
  })

  test('ignores unmounted headings (findChild null)', () => {
    const geom = makeGeometry({ positions: { a: { y: -1 } } })
    expect(findHeadingNearTop(geom, ['a', 'missing'], 0)).toBe('a')
  })
})

describe('findVisibleHeadingIds', () => {
  test('includes headings whose box intersects [top, bottom)', () => {
    // top = 0 + topOffset(2) = 2; bottom = 0 + viewportHeight(10) = 10.
    const geom = makeGeometry({
      viewportHeight: 10,
      positions: { above: { y: 1 }, edge: { y: 2 }, mid: { y: 5 }, below: { y: 10 } },
    })
    const visible = findVisibleHeadingIds(geom, ['above', 'edge', 'mid', 'below'], 2)
    // above: bottom 2 > 2? no. edge: bottom 3 > 2 && top 2 < 10 → yes. mid → yes. below: top 10 < 10? no.
    expect([...visible].sort()).toEqual(['edge', 'mid'])
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

describe('resolveMatchY', () => {
  // One block, one run, two elements → two content bearers. The match lands in
  // element index 1, so the result must be that bearer's y + its visual line.
  const projections = new Map<string, BlockProjection>([
    [
      'blk',
      {
        blockElementId: 'blk',
        blockPath: [0],
        runs: [
          {
            key: 'r0',
            segments: [
              { element: 0, text: 'hello', searchable: true },
              { element: 1, text: 'world', searchable: true },
            ],
          },
        ],
      },
    ],
  ])
  const bearers = {
    blk: [
      { y: 100, plainText: 'hello', lineInfo: { lineStartCols: [0] } },
      { y: 200, plainText: 'world', lineInfo: { lineStartCols: [0] } },
    ],
  }

  test('lands on the element ordinal containing match.start', () => {
    const geom = makeGeometry({ positions: { blk: { y: 100 } }, bearers })
    // match.start = 5 → first char of "world" (element 1). Expect bearer[1].y = 200.
    const match: Match = {
      blockPath: [0],
      blockElementId: 'blk',
      runKey: 'r0',
      start: 5,
      length: 1,
    }
    expect(resolveMatchY(geom, match, projections)).toBe(200)
  })

  test('returns block.y when the run is unknown', () => {
    const geom = makeGeometry({ positions: { blk: { y: 42 } }, bearers })
    const match: Match = {
      blockPath: [0],
      blockElementId: 'blk',
      runKey: 'nope',
      start: 0,
      length: 1,
    }
    expect(resolveMatchY(geom, match, projections)).toBe(42)
  })

  test('null when the block is unmounted', () => {
    const match: Match = {
      blockPath: [0],
      blockElementId: 'blk',
      runKey: 'r0',
      start: 0,
      length: 1,
    }
    expect(resolveMatchY(makeGeometry(), match, projections)).toBeNull()
  })

  test('advances elementBase past prior runs (cross-run match)', () => {
    // r0 spans two elements (runElementCount 2) → elementBase for r1 is 2.
    // Target is r1's element 0, so the answer is content bearer index 2.
    const proj = new Map<string, BlockProjection>([
      [
        'blk',
        {
          blockElementId: 'blk',
          blockPath: [0],
          runs: [
            {
              key: 'r0',
              segments: [
                { element: 0, text: 'aa', searchable: true },
                { element: 1, text: 'bb', searchable: true },
              ],
            },
            { key: 'r1', segments: [{ element: 0, text: 'cc', searchable: true }] },
          ],
        },
      ],
    ])
    const geom = makeGeometry({
      positions: { blk: { y: 0 } },
      bearers: {
        blk: [
          { y: 10, plainText: 'aa', lineInfo: { lineStartCols: [0] } },
          { y: 20, plainText: 'bb', lineInfo: { lineStartCols: [0] } },
          { y: 30, plainText: 'cc', lineInfo: { lineStartCols: [0] } },
        ],
      },
    })
    const match: Match = {
      blockPath: [0],
      blockElementId: 'blk',
      runKey: 'r1',
      start: 0,
      length: 1,
    }
    expect(resolveMatchY(geom, match, proj)).toBe(30)
  })

  test('skips rule bearers so content ordinals stay aligned', () => {
    // A rule bearer is interleaved; the filter must drop it before indexing,
    // else element 1 would resolve to the rule bearer's y instead of "world".
    const proj = new Map<string, BlockProjection>([
      [
        'blk',
        {
          blockElementId: 'blk',
          blockPath: [0],
          runs: [
            {
              key: 'r0',
              segments: [
                { element: 0, text: 'hello', searchable: true },
                { element: 1, text: 'world', searchable: true },
              ],
            },
          ],
        },
      ],
    ])
    const geom = makeGeometry({
      positions: { blk: { y: 0 } },
      bearers: {
        blk: [
          { y: 10, plainText: 'hello', lineInfo: { lineStartCols: [0] } },
          { y: 15, plainText: '│──│', lineInfo: { lineStartCols: [0] } },
          { y: 20, plainText: 'world', lineInfo: { lineStartCols: [0] } },
        ],
      },
    })
    const match: Match = {
      blockPath: [0],
      blockElementId: 'blk',
      runKey: 'r0',
      start: 5,
      length: 1,
    }
    expect(resolveMatchY(geom, match, proj)).toBe(20)
  })
})

describe('matchScrollDelta', () => {
  const projections = new Map<string, BlockProjection>([
    [
      'blk',
      {
        blockElementId: 'blk',
        blockPath: [0],
        runs: [{ key: 'r0', segments: [{ element: 0, text: 'hi', searchable: true }] }],
      },
    ],
  ])

  test('composes resolveMatchY with matchJumpDelta for a mounted block', () => {
    const geom = makeGeometry({
      viewportTop: 4,
      positions: { blk: { y: 50 } },
      bearers: { blk: [{ y: 50, plainText: 'hi', lineInfo: { lineStartCols: [0] } }] },
    })
    const match: Match = {
      blockPath: [0],
      blockElementId: 'blk',
      runKey: 'r0',
      start: 0,
      length: 1,
    }
    // matchY resolves to bearer.y (50); pin composition against matchJumpDelta.
    const expected = matchJumpDelta({ matchY: 50, viewportTop: 4, topOffset: 2 })
    expect(matchScrollDelta(geom, projections, { match, topOffset: 2 })).toBe(expected)
  })

  test('null when the match block is unmounted', () => {
    const match: Match = {
      blockPath: [0],
      blockElementId: 'blk',
      runKey: 'r0',
      start: 0,
      length: 1,
    }
    expect(matchScrollDelta(makeGeometry(), projections, { match, topOffset: 2 })).toBeNull()
  })
})

describe('resolveScrollMarks', () => {
  test('converts match screen-y to document space and reports geometry', () => {
    const projections = new Map<string, BlockProjection>([
      [
        'blk',
        {
          blockElementId: 'blk',
          blockPath: [0],
          runs: [{ key: 'r0', segments: [{ element: 0, text: 'hi', searchable: true }] }],
        },
      ],
    ])
    const geom = makeGeometry({
      viewportTop: 3,
      viewportHeight: 10,
      scrollTop: 30,
      scrollHeight: 500,
      positions: { blk: { y: 50 } },
      bearers: { blk: [{ y: 50, plainText: 'hi', lineInfo: { lineStartCols: [0] } }] },
    })
    const match: Match = {
      blockPath: [0],
      blockElementId: 'blk',
      runKey: 'r0',
      start: 0,
      length: 1,
    }
    const res = resolveScrollMarks(geom, 7, projections, { matches: [match], activeIndex: 0 })
    // screenToDoc = scrollTop(30) - viewportTop(3) = 27; matchY 50 → docY 77.
    expect(res.marks).toEqual([{ y: 77, kind: 'activeMatch' }])
    expect(res.realContentHeight).toBe(500 - 7)
    expect(res.viewportHeight).toBe(10)
  })
})
