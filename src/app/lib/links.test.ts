import { describe, expect, test } from 'bun:test'
import { classifyHref } from './links'

const base = '/docs'

describe('classifyHref', () => {
  test('anchor', () => {
    expect(classifyHref({ baseDir: base, href: '#install' })).toEqual({
      kind: 'anchor',
      id: 'install',
    })
  })
  test('bare anchor (empty id)', () => {
    expect(classifyHref({ baseDir: base, href: '#' })).toEqual({
      kind: 'anchor',
      id: '',
    })
  })
  test('relative .md', () => {
    expect(classifyHref({ baseDir: base, href: './api.md' })).toEqual({
      kind: 'doc',
      absPath: '/docs/api.md',
      anchor: undefined,
    })
  })
  test('relative .md with anchor + parent segment', () => {
    expect(classifyHref({ baseDir: base, href: '../guide.md#setup' })).toEqual({
      kind: 'doc',
      absPath: '/guide.md',
      anchor: 'setup',
    })
  })
  test('.markdown extension', () => {
    expect(classifyHref({ baseDir: base, href: './x.markdown' }).kind).toBe('doc')
  })
  test.each([
    'https://example.com',
    'http://x',
    'mailto:a@b.com',
    '//cdn/x.md',
    './image.png',
    './script.ts',
    '/abs/path.md',
  ])('ignores %s', href => {
    expect(classifyHref({ baseDir: base, href }).kind).toBe('ignore')
  })
  test('relative .md ignored when baseDir undefined (stdin)', () => {
    expect(classifyHref({ baseDir: undefined, href: './a.md' }).kind).toBe('ignore')
  })
})
