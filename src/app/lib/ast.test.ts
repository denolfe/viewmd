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
    expect(toc).toMatchObject([
      {
        id: 'a',
        level: 1,
        text: 'A',
        inline: [{ kind: 'text', value: 'A' }],
        children: [
          { id: 'b', level: 2, text: 'B', children: [] },
          { id: 'c', level: 2, text: 'C', children: [] },
        ],
      },
      { id: 'd', level: 1, text: 'D', children: [] },
    ])
  })

  test('paragraph with single image is lifted to image block', () => {
    const { nodes } = buildTree('![alt](src.png)')
    expect(nodes[0]).toEqual({ kind: 'image', alt: 'alt', src: 'src.png' })
  })

  test('<img>-only html block is lifted to image block', () => {
    const { nodes } = buildTree('<img alt="a" src="b.png" />')
    expect(nodes[0]).toEqual({ kind: 'image', alt: 'a', src: 'b.png' })
  })

  test('ordered list captures source start', () => {
    const { nodes } = buildTree('5. five\n6. six\n')
    const list = nodes.find(n => n.kind === 'list')
    expect(list).toMatchObject({ kind: 'list', ordered: true, start: 5 })
  })

  test('<kbd> renders as a kbd inline node', () => {
    const { nodes } = buildTree('Press <kbd>Ctrl+C</kbd> to quit.')
    const para = nodes.find(n => n.kind === 'paragraph')
    expect(para && para.kind === 'paragraph').toBe(true)
    if (para?.kind !== 'paragraph') throw new Error('expected paragraph')
    const kbd = para.inline.find(i => i.kind === 'kbd')
    expect(kbd && kbd.kind === 'kbd' && kbd.value).toBe('Ctrl+C')
  })

  test('returns headingIds in document order', () => {
    const { headingIds } = buildTree('# A\n## B\n## C\n# D')
    expect(headingIds).toEqual(['a', 'b', 'c', 'd'])
  })

  test('headingIds includes ids from lifted html blocks', () => {
    const md = '# A\n\n<h2>Lifted</h2>\n\n## B'
    const { headingIds } = buildTree(md)
    expect(headingIds).toEqual(['a', 'lifted', 'b'])
  })

  test('heading codespan captured as inline node', () => {
    const { toc } = buildTree('## Use `foo` now')
    expect(toc[0]?.text).toBe('Use `foo` now')
    expect(toc[0]?.inline).toEqual([
      { kind: 'text', value: 'Use ' },
      { kind: 'codespan', value: 'foo' },
      { kind: 'text', value: ' now' },
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

describe('buildTree — details wrapping', () => {
  test('multi-block <details> wraps body nodes into a single details node', () => {
    const md = [
      '<details>',
      '<summary>Click to expand</summary>',
      '',
      '1. First',
      '2. Second',
      '',
      '</details>',
    ].join('\n')
    const { nodes } = buildTree(md)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.kind).toBe('details')
    if (nodes[0]?.kind !== 'details') throw new Error('not details')
    expect(nodes[0].summary[0]).toMatchObject({ kind: 'text', value: 'Click to expand' })
    expect(nodes[0].children.some(n => n.kind === 'list')).toBe(true)
  })

  test('summary with inline markdown preserves formatting', () => {
    const md = [
      '<details>',
      '<summary>**Bold** summary</summary>',
      '',
      'body',
      '',
      '</details>',
    ].join('\n')
    const { nodes } = buildTree(md)
    if (nodes[0]?.kind !== 'details') throw new Error('not details')
    expect(nodes[0].summary[0]?.kind).toBe('strong')
  })

  test('details with no summary still wraps body', () => {
    const md = ['<details>', '', 'body', '', '</details>'].join('\n')
    const { nodes } = buildTree(md)
    expect(nodes[0]?.kind).toBe('details')
    if (nodes[0]?.kind !== 'details') throw new Error('not details')
    expect(nodes[0].summary).toEqual([])
  })

  test('unclosed <details> falls back to leaving nodes as-is', () => {
    const md = ['<details>', '<summary>S</summary>', '', 'body'].join('\n')
    const { nodes } = buildTree(md)
    expect(nodes[0]?.kind).toBe('html')
  })

  test('sibling <details> blocks each wrap independently', () => {
    const md = [
      '<details><summary>A</summary>',
      '',
      'a body',
      '',
      '</details>',
      '',
      '<details><summary>B</summary>',
      '',
      'b body',
      '',
      '</details>',
    ].join('\n')
    const { nodes } = buildTree(md)
    const detailsNodes = nodes.filter(n => n.kind === 'details')
    expect(detailsNodes).toHaveLength(2)
  })

  test('html <h3> + <ul> lifts to real heading and list nodes', () => {
    const md = [
      '<h3>Benefits</h3>',
      '<ul>',
      '  <li>One</li>',
      '  <li>Two with <code>code</code></li>',
      '</ul>',
    ].join('\n')
    const { nodes, toc } = buildTree(md)
    expect(nodes.map(n => n.kind)).toEqual(['heading', 'list'])
    const heading = nodes[0]
    if (heading?.kind !== 'heading') throw new Error('expected heading')
    expect(heading.level).toBe(3)
    expect(toc[0]?.id).toBe('benefits')
    const list = nodes[1]
    if (list?.kind !== 'list') throw new Error('expected list')
    expect(list.ordered).toBe(false)
    expect(list.items).toHaveLength(2)
  })

  test('html <ol> lifts to ordered list', () => {
    const md = '<ol><li>A</li><li>B</li></ol>'
    const { nodes } = buildTree(md)
    const list = nodes.find(n => n.kind === 'list')
    if (list?.kind !== 'list') throw new Error('not list')
    expect(list.ordered).toBe(true)
    expect(list.items).toHaveLength(2)
  })

  test('lifted html inserts a space before a following markdown block', () => {
    const md = ['<h3>X</h3>', '<ul><li>A</li></ul>', '', '## After'].join('\n')
    const { nodes } = buildTree(md)
    expect(nodes.map(n => n.kind)).toEqual(['heading', 'list', 'space', 'heading'])
  })

  test('lifted html does not duplicate a space when one already follows', () => {
    const md = ['<h3>X</h3>', '', '## After'].join('\n')
    const { nodes } = buildTree(md)
    const spaceCount = nodes.filter(n => n.kind === 'space').length
    expect(spaceCount).toBe(1)
  })

  test('html block without headings/lists stays as html', () => {
    const md = '<p align="center"><strong>just text</strong></p>'
    const { nodes } = buildTree(md)
    expect(nodes[0]?.kind).toBe('html')
  })

  test('nested <details> nest in the AST', () => {
    const md = [
      '<details>',
      '<summary>Outer</summary>',
      '',
      '<details>',
      '<summary>Inner</summary>',
      '',
      'inner body',
      '',
      '</details>',
      '',
      '</details>',
    ].join('\n')
    const { nodes } = buildTree(md)
    if (nodes[0]?.kind !== 'details') throw new Error('outer not details')
    const inner = nodes[0].children.find(n => n.kind === 'details')
    expect(inner).toBeDefined()
    if (inner?.kind !== 'details') throw new Error('inner not details')
    expect(inner.summary[0]).toMatchObject({ kind: 'text', value: 'Inner' })
  })
})
