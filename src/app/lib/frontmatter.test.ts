import { describe, expect, it } from 'bun:test'

import type { FrontmatterRow } from './frontmatter'
import { parseFrontmatter, splitFrontmatter } from './frontmatter'

describe('splitFrontmatter', () => {
  it('returns body unchanged when no frontmatter', () => {
    const md = '# Hello\n\nSome content.\n'
    expect(splitFrontmatter(md)).toEqual({ frontmatter: null, body: md })
  })

  it('extracts simple frontmatter', () => {
    const md = '---\ntitle: Hello\nauthor: Elliot\n---\n# Body\n'
    expect(splitFrontmatter(md)).toEqual({
      frontmatter: 'title: Hello\nauthor: Elliot',
      body: '# Body\n',
    })
  })

  it('handles CRLF line endings', () => {
    const md = '---\r\ntitle: Hello\r\n---\r\n# Body\r\n'
    expect(splitFrontmatter(md)).toEqual({
      frontmatter: 'title: Hello',
      body: '# Body\r\n',
    })
  })

  it('returns null frontmatter when closing fence is missing', () => {
    const md = '---\ntitle: Hello\n# Body\n'
    expect(splitFrontmatter(md)).toEqual({ frontmatter: null, body: md })
  })

  it('returns null frontmatter when opening fence is not at column 0', () => {
    const md = ' ---\ntitle: Hello\n---\n# Body\n'
    expect(splitFrontmatter(md)).toEqual({ frontmatter: null, body: md })
  })

  it('returns empty string for empty frontmatter block (---\\n---\\n)', () => {
    const md = '---\n---\n# Body\n'
    expect(splitFrontmatter(md)).toEqual({ frontmatter: '', body: '# Body\n' })
  })

  it('returns empty string for empty frontmatter with blank line (---\\n\\n---\\n)', () => {
    const md = '---\n\n---\n# Body\n'
    expect(splitFrontmatter(md)).toEqual({ frontmatter: '', body: '# Body\n' })
  })

  it('does not match closing fence when followed by extra content on same line', () => {
    const md = '---\ntitle: x\n---extra\n# Body\n'
    expect(splitFrontmatter(md)).toEqual({ frontmatter: null, body: md })
  })

  it('preserves content after closing fence into body', () => {
    const md = '---\ntitle: Hello\n---\nFirst line\n\n## Section\n'
    expect(splitFrontmatter(md)).toEqual({
      frontmatter: 'title: Hello',
      body: 'First line\n\n## Section\n',
    })
  })

  it('value ending in --- does not close the block early', () => {
    const md = '---\ntitle: a---\nauthor: b\n---\nbody\n'
    expect(splitFrontmatter(md)).toEqual({
      frontmatter: 'title: a---\nauthor: b',
      body: 'body\n',
    })
  })

  it('tolerates trailing spaces/tabs after the closing fence', () => {
    const md = '---\ntitle: a\n---  \nbody\n'
    expect(splitFrontmatter(md)).toEqual({
      frontmatter: 'title: a',
      body: 'body\n',
    })
  })
})

describe('parseFrontmatter', () => {
  it('returns [] for empty input', () => {
    expect(parseFrontmatter('')).toEqual([])
  })

  it('returns [] for blank-only input', () => {
    expect(parseFrontmatter('   \n\n  ')).toEqual([])
  })

  it('parses simple inline pairs', () => {
    const inner = 'title: Hello\nauthor: Elliot'
    const result: FrontmatterRow[] = parseFrontmatter(inner)
    expect(result).toEqual([
      { kind: 'inline', key: 'title', value: 'Hello' },
      { kind: 'inline', key: 'author', value: 'Elliot' },
    ])
  })

  it('parses nested object as raw block', () => {
    const inner = 'author:\n  name: Elliot\n  email: e@example.com'
    const result = parseFrontmatter(inner)
    expect(result).toEqual([
      { kind: 'raw', key: 'author', lines: ['  name: Elliot', '  email: e@example.com'] },
    ])
  })

  it('parses list values as raw block', () => {
    const inner = 'tags:\n- a\n- b'
    const result = parseFrontmatter(inner)
    expect(result).toEqual([{ kind: 'raw', key: 'tags', lines: ['- a', '- b'] }])
  })

  it('parses mixed inline and raw rows preserving source order', () => {
    const inner = 'title: Hello\ntags:\n  - a\n  - b\nauthor: Elliot'
    const result = parseFrontmatter(inner)
    expect(result).toEqual([
      { kind: 'inline', key: 'title', value: 'Hello' },
      { kind: 'raw', key: 'tags', lines: ['  - a', '  - b'] },
      { kind: 'inline', key: 'author', value: 'Elliot' },
    ])
  })

  it('preserves quoted value with embedded colon verbatim', () => {
    const inner = 'title: "foo: bar"'
    const result = parseFrontmatter(inner)
    expect(result).toEqual([{ kind: 'inline', key: 'title', value: '"foo: bar"' }])
  })

  it('drops blank separator lines between rows', () => {
    const inner = 'title: Hello\n\nauthor: Elliot'
    const result = parseFrontmatter(inner)
    expect(result).toEqual([
      { kind: 'inline', key: 'title', value: 'Hello' },
      { kind: 'inline', key: 'author', value: 'Elliot' },
    ])
  })

  it('bundles malformed top-level lines into trailing raw row with empty key', () => {
    const inner = 'title: Hello\n!!!bad line\nanother bad\nauthor: Elliot'
    const result = parseFrontmatter(inner)
    expect(result).toEqual([
      { kind: 'inline', key: 'title', value: 'Hello' },
      { kind: 'inline', key: 'author', value: 'Elliot' },
      { kind: 'raw', key: '', lines: ['!!!bad line', 'another bad'] },
    ])
  })

  it('handles key with hyphens', () => {
    const inner = 'last-modified: 2024-01-01'
    const result = parseFrontmatter(inner)
    expect(result).toEqual([{ kind: 'inline', key: 'last-modified', value: '2024-01-01' }])
  })

  it('handles CRLF line endings in inner text', () => {
    const input = 'title: Hi\r\ntags:\r\n  - a\r\n  - b'
    expect(parseFrontmatter(input)).toEqual([
      { kind: 'inline', key: 'title', value: 'Hi' },
      { kind: 'raw', key: 'tags', lines: ['  - a', '  - b'] },
    ])
  })

  it('keeps a raw block intact when a blank line separates its children', () => {
    const input = ['author:', '  name: Elliot', '', '  email: e@example.com'].join('\n')
    expect(parseFrontmatter(input)).toEqual([
      { kind: 'raw', key: 'author', lines: ['  name: Elliot', '  email: e@example.com'] },
    ])
  })
})
