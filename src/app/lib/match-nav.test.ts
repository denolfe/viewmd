import { describe, expect, test } from 'bun:test'
import { buildTree } from './ast'
import { findMatches } from './search'
import { nearestPrecedingHeadingId } from './match-nav'

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
