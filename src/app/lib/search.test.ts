import { describe, expect, test } from 'bun:test'
import { buildTree } from './ast'
import { blockId } from './scroll-marks'
import { findMatches } from './search'

const count = (md: string, q: string) =>
  findMatches({ nodes: buildTree(md).nodes, pattern: q, contentWidth: 80 }).length

describe('findMatches', () => {
  test('empty pattern returns empty', () => {
    const { nodes } = buildTree('hello world')
    expect(findMatches({ nodes: nodes, pattern: '', contentWidth: 80 })).toEqual([])
  })

  test('finds case-insensitive match in paragraph', () => {
    const { nodes } = buildTree('Hello World')
    const m = findMatches({ nodes: nodes, pattern: 'hello', contentWidth: 80 })
    expect(m.length).toBe(1)
    expect(m[0]?.start).toBe(0)
    expect(m[0]?.length).toBe(5)
  })

  test('finds multiple matches', () => {
    const { nodes } = buildTree('foo bar foo')
    const m = findMatches({ nodes: nodes, pattern: 'foo', contentWidth: 80 })
    expect(m.length).toBe(2)
  })

  test('searches inside strong', () => {
    const { nodes } = buildTree('**bold target** trailing')
    expect(findMatches({ nodes: nodes, pattern: 'target', contentWidth: 80 }).length).toBe(1)
  })

  test('searches code blocks', () => {
    const { nodes } = buildTree('```\nfoo target\n```')
    expect(findMatches({ nodes: nodes, pattern: 'target', contentWidth: 80 }).length).toBe(1)
  })

  test('searches inside blockquote and extends path', () => {
    const { nodes } = buildTree('> target text')
    const m = findMatches({ nodes: nodes, pattern: 'target', contentWidth: 80 })
    expect(m.length).toBe(1)
    // Path should include both blockquote index and child paragraph index.
    expect(m[0]?.blockPath.length).toBeGreaterThan(1)
  })

  test('searches inside list items', () => {
    const { nodes } = buildTree('- alpha\n- target item\n- gamma')
    const m = findMatches({ nodes: nodes, pattern: 'target', contentWidth: 80 })
    expect(m.length).toBe(1)
  })

  test('matches alt text on image blocks', () => {
    const { nodes } = buildTree('![cat picture](cat.png)')
    expect(findMatches({ nodes: nodes, pattern: 'cat', contentWidth: 80 }).length).toBeGreaterThan(
      0,
    )
  })

  test('matches alt text on inline images inside paragraphs', () => {
    const { nodes } = buildTree('See ![the cat](cat.png) in action')
    expect(
      findMatches({ nodes: nodes, pattern: 'the cat', contentWidth: 80 }).length,
    ).toBeGreaterThan(0)
  })

  test('searches inside table header and body with run keys', () => {
    const md = '| H1 | H2 |\n|---|---|\n| body target | x |'
    const { nodes } = buildTree(md)
    const headerMatch = findMatches({ nodes: nodes, pattern: 'H1', contentWidth: 80 })
    const bodyMatch = findMatches({ nodes: nodes, pattern: 'target', contentWidth: 80 })
    expect(headerMatch.length).toBe(1)
    expect(headerMatch[0]?.runKey).toBe('h0') // first header cell
    expect(bodyMatch.length).toBe(1)
    expect(bodyMatch[0]?.runKey).toBe('r0c0') // first body row, first cell
  })

  test('stamps blockElementId: heading slug for headings, blockId otherwise', () => {
    const { nodes } = buildTree('# Alpha bravo\n\nalpha bravo\n')
    const matches = findMatches({ nodes: nodes, pattern: 'bravo', contentWidth: 80 })
    const heading = nodes[0]
    expect(heading?.kind).toBe('heading')
    expect(matches[0]?.blockElementId).toBe(heading?.kind === 'heading' ? heading.id : '')
    expect(matches[1]?.blockElementId).toBe(blockId([1]))
  })
})

describe('visible-text matching', () => {
  const DOC = [
    '# Title',
    '',
    '1. first item',
    '2. second item',
    '',
    '- bullet one',
    '- [x] done task',
    '',
    'Click [linktext **bold inside** here](https://example.com) please.',
    '',
    'Some ~~struck text~~ here. Emphasis *spanning* boundary.',
  ].join('\n')

  test.each([
    ['1. ', 1],
    ['- ', 1],
    ['[✓] ', 1],
    ['1. first item', 1],
    ['Click linktext', 1],
    ['here please', 1],
    ['with bold inside', 0], // 'with' is not in the doc; guard against false joins
    ['linktext bold inside here', 1],
    ['struck text', 1],
    ['Emphasis spanning', 1],
    ['example.com', 0], // markdown link href is invisible
  ])('%p → %i matches', (q, n) => {
    expect(count(DOC, q)).toBe(n)
  })

  test('html blocks match visible text only', async () => {
    const md = await Bun.file(new URL('../../../test/html-test.md', import.meta.url)).text()
    expect(count(md, 'href')).toBe(0)
    expect(count(md, 'img.shields')).toBe(0)
    expect(count(md, 'alert')).toBe(0)
    expect(count(md, 'Build')).toBe(1)
    expect(count(md, '▾')).toBe(0) // details toggle is unsearchable
  })

  test('match carries run coordinates', () => {
    const [m] = findMatches({
      nodes: buildTree('1. first item').nodes,
      pattern: '1. first',
      contentWidth: 80,
    })
    expect(m).toMatchObject({ runKey: 'main', start: 0, length: 8 })
    expect(m?.blockElementId).toBe('itm-0-0')
  })
})
