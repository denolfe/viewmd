import { describe, expect, test } from 'bun:test'
import { buildTree } from './ast'
import { findMatches } from './search'
import {
  matchJumpDelta,
  matchScrollTarget,
  nearestPrecedingHeadingId,
  seedMatchIndex,
} from './match-nav'

describe('nearestPrecedingHeadingId', () => {
  test('returns id of heading just before match', () => {
    const md = '# A\n\nfoo target\n\n# B\n\nbar'
    const { nodes } = buildTree(md)
    const [m] = findMatches(nodes, 'target')
    if (!m) throw new Error('expected a match')
    expect(nearestPrecedingHeadingId(nodes, m)).toBe('a')
  })

  test('returns null when no heading precedes the match', () => {
    const md = 'target text\n\n# H'
    const { nodes } = buildTree(md)
    const [m] = findMatches(nodes, 'target')
    if (!m) throw new Error('expected a match')
    expect(nearestPrecedingHeadingId(nodes, m)).toBe(null)
  })
})

describe('matchJumpDelta', () => {
  // Viewport top row 100; breadcrumb occludes rows 100-101; the match lands
  // JUMP_CONTEXT_ROWS (5) below that, at row 107.
  const viewport = { viewportTop: 100, topOffset: 2 }

  test('zero when the match already sits at the jump target row', () => {
    expect(matchJumpDelta({ ...viewport, matchY: 107 })).toBe(0)
  })

  test('scrolls a visible mid-screen match up to the jump target row', () => {
    expect(matchJumpDelta({ ...viewport, matchY: 112 })).toBe(5)
  })

  test('scrolls down so a far match lands at the jump target row', () => {
    expect(matchJumpDelta({ ...viewport, matchY: 200 })).toBe(93)
  })

  test('scrolls up for a match above the viewport', () => {
    expect(matchJumpDelta({ ...viewport, matchY: 10 })).toBe(-97)
  })

  test('no breadcrumb: only the context rows sit above the match', () => {
    expect(matchJumpDelta({ viewportTop: 100, topOffset: 0, matchY: 130 })).toBe(25)
  })
})

describe('seedMatchIndex', () => {
  const viewport = { viewportTop: 100 }

  test('forward picks the first match at or below the viewport top', () => {
    expect(seedMatchIndex({ ...viewport, matchYs: [10, 105, 110, 200], dir: 'forward' })).toBe(1)
    expect(seedMatchIndex({ ...viewport, matchYs: [10, 100, 200], dir: 'forward' })).toBe(1)
  })

  test('forward wraps to the first match when all matches are above', () => {
    expect(seedMatchIndex({ ...viewport, matchYs: [10, 50], dir: 'forward' })).toBe(0)
  })

  test('backward picks the last match above the viewport top', () => {
    expect(seedMatchIndex({ ...viewport, matchYs: [10, 50, 130, 200], dir: 'backward' })).toBe(1)
  })

  test('backward ignores visible matches at or below the top', () => {
    expect(seedMatchIndex({ ...viewport, matchYs: [10, 105, 110], dir: 'backward' })).toBe(0)
  })

  test('backward wraps to the last match when all matches are below', () => {
    expect(seedMatchIndex({ ...viewport, matchYs: [130, 200], dir: 'backward' })).toBe(1)
  })

  test('skips unresolvable match positions', () => {
    expect(seedMatchIndex({ ...viewport, matchYs: [null, 105], dir: 'forward' })).toBe(1)
  })
})

describe('matchScrollTarget', () => {
  test('offset reserves the breadcrumb height so the match lands below the overlay', () => {
    const md = '# A\n\n## B\n\nfoo target\n\n# C'
    const { nodes, toc } = buildTree(md)
    const [m] = findMatches(nodes, 'target')
    if (!m) throw new Error('expected a match')
    // Match sits under `## B`; after the jump both `# A` and the offscreen
    // `## B` render as crumbs — two overlay rows the scroll must clear.
    expect(matchScrollTarget({ nodes, toc, match: m })).toEqual({ headingId: 'b', topOffset: 2 })
  })

  test('returns null when no heading precedes the match', () => {
    const md = 'target text\n\n# H'
    const { nodes, toc } = buildTree(md)
    const [m] = findMatches(nodes, 'target')
    if (!m) throw new Error('expected a match')
    expect(matchScrollTarget({ nodes, toc, match: m })).toBe(null)
  })
})
