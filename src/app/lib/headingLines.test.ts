import { describe, expect, it } from 'bun:test'
import { buildTree, lexMarkdown } from './ast'
import { computeHeadingLines, countNewlines } from './headingLines'
import { renderDiagramBlocks } from './preprocess'

const linesOf = (body: string, offset = 0) =>
  computeHeadingLines({ tokens: lexMarkdown(body), offset })

describe('computeHeadingLines', () => {
  it('maps heading ids to 1-based source lines with dedup', () => {
    expect(linesOf('# A\n\n## B\n\ntext\n\n## B\n')).toEqual({ a: 1, b: 3, 'b-2': 7 })
  })

  it('produces ids matching buildTree', () => {
    const body = '# A\n\n## B\n\ntext\n\n## B\n'
    expect(Object.keys(linesOf(body))).toEqual(buildTree(body).headingIds)
  })

  it('applies the frontmatter offset to every line', () => {
    expect(linesOf('# A\n\n## B\n\ntext\n\n## B\n', 4)).toEqual({ a: 5, b: 7, 'b-2': 11 })
  })

  it('reports the original-body line for headings after a mermaid block', () => {
    const body = '```mermaid\ngraph TD\nA-->B\n```\n\n## After\n'
    // lines: 1 ```mermaid, 2 graph TD, 3 A-->B, 4 ```, 5 blank, 6 ## After
    expect(linesOf(body)).toEqual({ after: 6 })
  })

  it('is unaffected by diagram rendering on the same tokens', () => {
    const body = '```mermaid\ngraph TD\nA-->B\n```\n\n## After\n'
    const tokens = renderDiagramBlocks(lexMarkdown(body))
    expect(computeHeadingLines({ tokens, offset: 0 })).toEqual({ after: 6 })
  })

  it('accumulates lines for a heading preceded by paragraphs and blanks', () => {
    expect(linesOf('intro para\n\nmore text\n\n# Heading\n')).toEqual({ heading: 5 })
  })

  it('captures blockquote-nested headings with shared dedup', () => {
    const body = '> # Intro\n\n# Intro\n'
    expect(buildTree(body).headingIds).toEqual(['intro', 'intro-2'])
    expect(linesOf(body)).toEqual({ intro: 1, 'intro-2': 3 })
  })

  it('captures a heading nested in a blockquote after a top-level heading', () => {
    const body = '# Normal\n\n> # Quote\n'
    expect(buildTree(body).headingIds).toEqual(['normal', 'quote'])
    expect(linesOf(body)).toEqual({ normal: 1, quote: 3 })
  })

  it('captures list-item-nested headings', () => {
    const body = '- # ListH\n\n# Top\n'
    expect(buildTree(body).headingIds).toEqual(['listh', 'top'])
    expect(linesOf(body)).toEqual({ listh: 1, top: 3 })
  })

  it('keeps id set + order aligned with buildTree across nested fixtures', () => {
    const fixtures = [
      '# A\n\n## B\n\ntext\n\n## B\n',
      '> # Intro\n\n# Intro\n',
      '# Normal\n\n> # Quote\n',
      '- # ListH\n\n# Top\n',
    ]
    for (const body of fixtures) {
      expect(Object.keys(linesOf(body))).toEqual(buildTree(body).headingIds)
    }
  })
})

describe('countNewlines', () => {
  it('counts every newline, including leading, trailing, and consecutive ones', () => {
    expect(countNewlines('')).toBe(0)
    expect(countNewlines('no newline')).toBe(0)
    expect(countNewlines('\n')).toBe(1)
    expect(countNewlines('a\n\nb\n')).toBe(3)
  })
})
