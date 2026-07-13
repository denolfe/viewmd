import { describe, expect, test } from 'bun:test'
import { buildTree } from './ast'
import { projectDocument, runText, listItemRowId } from './visible-text'

function projectMd(md: string) {
  return projectDocument(buildTree(md).nodes)
}
function texts(md: string): string[] {
  return projectMd(md).flatMap(p => p.runs.map(runText))
}

describe('projectDocument', () => {
  test('paragraph with link, strong, em, del flattens to one contiguous run', () => {
    expect(texts('Click [linktext **b** here](https://x.com) and ~~gone~~ *now*.')).toEqual([
      'Click linktext b here and gone now.',
    ])
  })

  test('heading includes prefix; H1 includes pad spaces', () => {
    const [h1, h2] = texts('# Top\n\n## Sub')
    expect(h1).toBe(' Top ')
    expect(h2).toBe('## Sub')
  })

  test('codespan and kbd project pill glyphs around the value', () => {
    expect(texts('run `x` now')).toEqual(['run ▐x▌ now'])
  })

  test('ordered/bullet/task list items join marker and first paragraph in one run', () => {
    const md = '1. first item\n2. second item'
    const projs = projectMd(md)
    expect(projs.map(p => p.runs[0] && runText(p.runs[0]))).toEqual([
      '1. first item',
      '2. second item',
    ])
    expect(projs[0]?.blockElementId).toBe(listItemRowId([0, 0]))
    expect(projs[0]?.runs[0]?.segments.map(s => s.element)).toEqual([0, 1])
    expect(texts('- bullet one')).toEqual(['- bullet one'])
    expect(texts('- [x] done\n- [ ] todo')).toEqual(['[✓] done', '[ ] todo'])
  })

  test('block image projects [Image: alt → src] furniture; alt-only and src-only mirror renderer', () => {
    expect(texts('![alt text](https://a.png)')).toEqual(['[Image: alt text → https://a.png]'])
    expect(texts('![](https://a.png)')).toEqual(['[Image: https://a.png]'])
  })

  test('html block projects visible segments only', () => {
    const md = [
      '<p align="center">',
      '  <a href="https://example.com/build"><img src="https://img.shields.io/x" alt="Build" /></a>',
      '</p>',
    ].join('\n')
    const [run] = texts(md)
    expect(run).toContain('[Image: Build]')
    expect(run).not.toContain('href')
    expect(run).not.toContain('img.shields')
  })

  test('script/style/comments vanish', () => {
    for (const t of texts("<script>alert('xss')</script>")) expect(t).not.toContain('alert')
  })

  test('details summary run: ▾ unsearchable, summary text searchable', () => {
    const md = '<details>\n<summary>Click me</summary>\n\nBody text\n\n</details>'
    const projs = projectMd(md)
    const summary = projs[0]?.runs[0]
    expect(summary).toBeDefined()
    if (!summary) return
    expect(runText(summary)).toBe('▾ Click me')
    expect(summary.segments[0]).toMatchObject({ text: '▾ ', searchable: false })
    expect(projs.some(p => p.runs.some(r => runText(r).includes('Body text')))).toBe(true)
  })

  test('table projects one run per cell, header first', () => {
    const md = '| Col |\n| --- |\n| zebra cell |'
    const proj = projectMd(md)[0]
    expect(proj?.runs.map(r => r.key)).toEqual(['h0', 'r0c0'])
    expect(proj?.runs.map(runText)).toEqual(['Col', 'zebra cell'])
  })

  test('br projects a newline', () => {
    expect(texts('a  \nb')[0]).toBe('a\nb')
  })

  test('blockquote children project with their own block ids', () => {
    const projs = projectMd('> quoted text')
    expect(projs[0]?.blockElementId).toBe('blk-0-0')
    expect(projs[0]?.runs[0]).toBeDefined()
    if (!projs[0]?.runs[0]) return
    expect(runText(projs[0].runs[0])).toBe('quoted text')
  })
})
