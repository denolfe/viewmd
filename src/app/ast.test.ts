import { describe, expect, test } from 'bun:test'
import { buildTree, slugify } from './ast'

describe('slugify', () => {
  test('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
  test('strips punctuation', () => {
    expect(slugify('Foo: Bar!')).toBe('foo-bar')
  })
})

describe('buildTree', () => {
  test('extracts heading TOC with hierarchy', () => {
    const { toc } = buildTree('# A\n## B\n## C\n# D')
    expect(toc).toEqual([
      {
        id: 'a',
        level: 1,
        text: 'A',
        children: [
          { id: 'b', level: 2, text: 'B', children: [] },
          { id: 'c', level: 2, text: 'C', children: [] },
        ],
      },
      { id: 'd', level: 1, text: 'D', children: [] },
    ])
  })

  test('dedupes duplicate slugs', () => {
    const { toc } = buildTree('# Intro\n# Intro')
    expect(toc.map(t => t.id)).toEqual(['intro', 'intro-2'])
  })

  test('dedupes against naturally-suffixed slugs', () => {
    const { toc } = buildTree('# Intro\n# Intro-2\n# Intro')
    const ids = toc.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length) // all unique
  })

  test('paragraph with strong+em inline', () => {
    const { nodes } = buildTree('**bold** and *em*')
    expect(nodes[0]?.kind).toBe('paragraph')
  })

  test('code block kind', () => {
    const { nodes } = buildTree('```js\nx\n```')
    expect(nodes[0]).toMatchObject({ kind: 'code', lang: 'js', value: 'x' })
  })
})
