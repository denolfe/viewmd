import { describe, expect, it } from 'bun:test'
import { buildTree } from './ast'
import { computeHeadingLines } from './headingLines'

describe('computeHeadingLines', () => {
  it('maps heading ids to 1-based source lines with dedup', () => {
    const body = '# A\n\n## B\n\ntext\n\n## B\n'
    expect(computeHeadingLines({ body, offset: 0 })).toEqual({ a: 1, b: 3, 'b-2': 7 })
  })

  it('produces ids matching buildTree', () => {
    const body = '# A\n\n## B\n\ntext\n\n## B\n'
    expect(Object.keys(computeHeadingLines({ body, offset: 0 }))).toEqual(
      buildTree(body).headingIds,
    )
  })

  it('applies the frontmatter offset to every line', () => {
    const body = '# A\n\n## B\n\ntext\n\n## B\n'
    expect(computeHeadingLines({ body, offset: 4 })).toEqual({ a: 5, b: 7, 'b-2': 11 })
  })

  it('reports the original-body line for headings after a mermaid block', () => {
    const body = '```mermaid\ngraph TD\nA-->B\n```\n\n## After\n'
    // lines: 1 ```mermaid, 2 graph TD, 3 A-->B, 4 ```, 5 blank, 6 ## After
    expect(computeHeadingLines({ body, offset: 0 })).toEqual({ after: 6 })
  })

  it('accumulates lines for a heading preceded by paragraphs and blanks', () => {
    const body = 'intro para\n\nmore text\n\n# Heading\n'
    expect(computeHeadingLines({ body, offset: 0 })).toEqual({ heading: 5 })
  })

  it('captures blockquote-nested headings with shared dedup', () => {
    const body = '> # Intro\n\n# Intro\n'
    expect(buildTree(body).headingIds).toEqual(['intro', 'intro-2'])
    expect(computeHeadingLines({ body, offset: 0 })).toEqual({ intro: 1, 'intro-2': 3 })
  })

  it('captures a heading nested in a blockquote after a top-level heading', () => {
    const body = '# Normal\n\n> # Quote\n'
    expect(buildTree(body).headingIds).toEqual(['normal', 'quote'])
    expect(computeHeadingLines({ body, offset: 0 })).toEqual({ normal: 1, quote: 3 })
  })

  it('captures list-item-nested headings', () => {
    const body = '- # ListH\n\n# Top\n'
    expect(buildTree(body).headingIds).toEqual(['listh', 'top'])
    expect(computeHeadingLines({ body, offset: 0 })).toEqual({ listh: 1, top: 3 })
  })

  it('keeps id set + order aligned with buildTree across nested fixtures', () => {
    const fixtures = [
      '# A\n\n## B\n\ntext\n\n## B\n',
      '> # Intro\n\n# Intro\n',
      '# Normal\n\n> # Quote\n',
      '- # ListH\n\n# Top\n',
    ]
    for (const body of fixtures) {
      expect(Object.keys(computeHeadingLines({ body, offset: 0 }))).toEqual(
        buildTree(body).headingIds,
      )
    }
  })
})
