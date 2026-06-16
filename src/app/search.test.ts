import { describe, expect, test } from 'bun:test'
import { buildTree } from './ast'
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
})
