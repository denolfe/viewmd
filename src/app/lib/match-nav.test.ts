import { describe, expect, test } from 'bun:test'
import { buildTree } from './ast'
import { findMatches } from './search'
import { matchScrollTarget, nearestPrecedingHeadingId } from './match-nav'

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

describe('matchScrollTarget', () => {
  test('offset reserves the breadcrumb height so the match lands below the overlay', () => {
    const md = '# A\n\n## B\n\nfoo target\n\n# C'
    const { nodes, toc } = buildTree(md)
    const [m] = findMatches(nodes, 'target')
    if (!m) throw new Error('expected a match')
    // Match sits under `## B`, whose ancestor stack (`# A`) occupies one
    // breadcrumb row — the offset the scroll must clear.
    expect(matchScrollTarget({ nodes, toc, match: m })).toEqual({ headingId: 'b', topOffset: 1 })
  })

  test('returns null when no heading precedes the match', () => {
    const md = 'target text\n\n# H'
    const { nodes, toc } = buildTree(md)
    const [m] = findMatches(nodes, 'target')
    if (!m) throw new Error('expected a match')
    expect(matchScrollTarget({ nodes, toc, match: m })).toBe(null)
  })
})
