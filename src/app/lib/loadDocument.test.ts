import { describe, expect, test } from 'bun:test'
import { FRONTMATTER_ID } from './frontmatter'
import { buildDocument } from './loadDocument'

describe('buildDocument', () => {
  test('parses headings into nodes/toc/headingIds', () => {
    const doc = buildDocument('# Title\n\nbody\n\n## Sub\n', '/tmp/docs/readme.md')
    expect(doc.headingIds.length).toBe(2)
    expect(doc.toc[0]?.text).toBe('Title')
    expect(doc.nodes.length).toBeGreaterThan(0)
  })

  test('derives fileLabel as parent/basename when filePath given', () => {
    const doc = buildDocument('# X\n', '/tmp/docs/readme.md')
    expect(doc.fileLabel).toBe('docs/readme.md')
  })

  test('fileLabel is undefined without a filePath', () => {
    const doc = buildDocument('# X\n')
    expect(doc.fileLabel).toBeUndefined()
  })

  test('extracts frontmatter rows', () => {
    const doc = buildDocument('---\ntitle: Hi\n---\n\n# Body\n', '/tmp/a.md')
    expect(doc.frontmatter.length).toBeGreaterThan(0)
  })

  test('prepends frontmatter id to headingIds so n/N stops on it', () => {
    const doc = buildDocument('---\ntitle: Hi\n---\n\n# Body\n\n## Sub\n', '/tmp/a.md')
    expect(doc.headingIds[0]).toBe(FRONTMATTER_ID)
    expect(doc.headingIds).toEqual([FRONTMATTER_ID, 'body', 'sub'])
  })

  test('omits frontmatter id from headingIds when there is no frontmatter', () => {
    const doc = buildDocument('# Body\n\n## Sub\n', '/tmp/a.md')
    expect(doc.headingIds).toEqual(['body', 'sub'])
  })

  test('maps heading ids to source lines', () => {
    const doc = buildDocument('# Title\n\nbody\n\n## Sub\n', '/tmp/a.md')
    expect(doc.headingLines).toEqual({ title: 1, sub: 5 })
  })

  test('offsets heading lines by the frontmatter block', () => {
    // ---\ntitle: x\n---\n\n# Head\n  => `# Head` is line 5 in the file
    const doc = buildDocument('---\ntitle: x\n---\n\n# Head\n', '/tmp/a.md')
    expect(doc.headingLines.head).toBe(5)
  })

  test('sets absPath and dir from an absolute path', () => {
    const doc = buildDocument('# Hi', '/a/b/c.md')
    expect(doc.absPath).toBe('/a/b/c.md')
    expect(doc.dir).toBe('/a/b')
  })

  test('resolves a relative path before deriving dir', () => {
    const doc = buildDocument('# Hi', 'c.md')
    expect(doc.absPath?.endsWith('/c.md')).toBe(true)
    expect(doc.dir).toBe(doc.absPath?.replace(/\/c\.md$/, ''))
  })

  test('leaves absPath/dir undefined for stdin', () => {
    const doc = buildDocument('# Hi')
    expect(doc.absPath).toBeUndefined()
    expect(doc.dir).toBeUndefined()
  })
})
