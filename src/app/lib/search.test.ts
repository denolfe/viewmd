import { describe, expect, test } from 'bun:test'
import { buildTree } from './ast'
import { blockId } from './scroll-marks'
import { findMatches } from './search'

describe('findMatches', () => {
  test('empty pattern returns empty', () => {
    const { nodes } = buildTree('hello world')
    expect(findMatches(nodes, '')).toEqual([])
  })

  test('finds case-insensitive match in paragraph', () => {
    const { nodes } = buildTree('Hello World')
    const m = findMatches(nodes, 'hello')
    expect(m.length).toBe(1)
    expect(m[0]?.offset).toBe(0)
    expect(m[0]?.length).toBe(5)
  })

  test('finds multiple matches', () => {
    const { nodes } = buildTree('foo bar foo')
    const m = findMatches(nodes, 'foo')
    expect(m.length).toBe(2)
  })

  test('searches inside strong', () => {
    const { nodes } = buildTree('**bold target** trailing')
    expect(findMatches(nodes, 'target').length).toBe(1)
  })

  test('searches code blocks', () => {
    const { nodes } = buildTree('```\nfoo target\n```')
    expect(findMatches(nodes, 'target').length).toBe(1)
  })

  test('searches inside blockquote and extends path', () => {
    const { nodes } = buildTree('> target text')
    const m = findMatches(nodes, 'target')
    expect(m.length).toBe(1)
    // Path should include both blockquote index and child paragraph index.
    expect(m[0]?.blockPath.length).toBeGreaterThan(1)
  })

  test('searches inside list items', () => {
    const { nodes } = buildTree('- alpha\n- target item\n- gamma')
    const m = findMatches(nodes, 'target')
    expect(m.length).toBe(1)
  })

  test('matches alt text on image blocks', () => {
    const { nodes } = buildTree('![cat picture](cat.png)')
    expect(findMatches(nodes, 'cat').length).toBeGreaterThan(0)
  })

  test('matches alt text on inline images inside paragraphs', () => {
    const { nodes } = buildTree('See ![the cat](cat.png) in action')
    expect(findMatches(nodes, 'the cat').length).toBeGreaterThan(0)
  })

  test('searches inside table header and body with row sentinel', () => {
    const md = '| H1 | H2 |\n|---|---|\n| body target | x |'
    const { nodes } = buildTree(md)
    const headerMatch = findMatches(nodes, 'H1')
    const bodyMatch = findMatches(nodes, 'target')
    expect(headerMatch.length).toBe(1)
    expect(headerMatch[0]?.inlinePath[0]).toBe(-1) // header row sentinel
    expect(bodyMatch.length).toBe(1)
    expect(bodyMatch[0]?.inlinePath[0]).toBe(0) // first body row
  })

  test('stamps blockElementId: heading slug for headings, blockId otherwise', () => {
    const { nodes } = buildTree('# Alpha bravo\n\nalpha bravo\n')
    const matches = findMatches(nodes, 'bravo')
    const heading = nodes[0]
    expect(heading?.kind).toBe('heading')
    expect(matches[0]?.blockElementId).toBe(heading?.kind === 'heading' ? heading.id : '')
    expect(matches[1]?.blockElementId).toBe(blockId([1]))
  })
})
