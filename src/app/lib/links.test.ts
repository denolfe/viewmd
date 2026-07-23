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
  test('in-doc anchor is decoded and slugified to match heading ids', () => {
    expect(classifyHref({ href: '#Installation' })).toEqual({ kind: 'anchor', id: 'installation' })
    expect(classifyHref({ href: '#my-section' })).toEqual({ kind: 'anchor', id: 'my-section' })
    expect(classifyHref({ href: '#secci%C3%B3n' })).toEqual({ kind: 'anchor', id: 'seccin' })
  })
  test('relative doc path is URL-decoded', () => {
    expect(classifyHref({ baseDir: '/docs', href: './My%20Doc.md' })).toEqual({
      kind: 'doc',
      absPath: '/docs/My Doc.md',
      anchor: undefined,
    })
  })
  test('malformed percent-encoding falls back to the raw path', () => {
    const t = classifyHref({ baseDir: '/docs', href: './bad%zz.md' })
    expect(t).toEqual({ kind: 'doc', absPath: '/docs/bad%zz.md', anchor: undefined })
  })
  test('doc-link anchor is normalized too', () => {
    expect(classifyHref({ baseDir: '/docs', href: 'other.md#Frag' })).toMatchObject({
      kind: 'doc',
      anchor: 'frag',
    })
  })
  test('percent-encoded absolute path does not escape baseDir', () => {
    // Decodes to `/etc/passwd.md`; must be re-checked against isAbsolute so
    // resolve() cannot discard baseDir and escape the doc's directory.
    expect(classifyHref({ baseDir: '/docs', href: '%2Fetc%2Fpasswd.md' })).toEqual({
      kind: 'ignore',
    })
  })
})
