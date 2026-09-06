import { describe, expect, test } from 'bun:test'
import type { Tokens } from 'marked'
import { lexMarkdown } from './ast'
import { MERMAID_ASCII_LANG, renderDiagramBlocks } from './preprocess'

const codeTokens = (tokens: Tokens.Generic[]): Tokens.Code[] => {
  const out: Tokens.Code[] = []
  for (const t of tokens) {
    if (t.type === 'code') out.push(t as Tokens.Code)
    if (t.type === 'blockquote') out.push(...codeTokens((t as Tokens.Blockquote).tokens))
    if (t.type === 'list') {
      for (const item of (t as Tokens.List).items) out.push(...codeTokens(item.tokens))
    }
  }
  return out
}

const render = (md: string): Tokens.Code[] => codeTokens(renderDiagramBlocks(lexMarkdown(md)))

describe('renderDiagramBlocks: mermaid', () => {
  test('rewrites a mermaid fence to ascii art under the rendered-ascii lang', () => {
    const [code] = render('```mermaid\ngraph TD\n  A --> B\n```')
    expect(code?.lang).toBe(MERMAID_ASCII_LANG)
    expect(code?.text).not.toContain('graph TD')
  })

  test('keeps raw intact so line counting over the same tokens still matches the file', () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```'
    const [code] = render(md)
    expect(code?.raw).toBe(md)
  })

  test('unrenderable mermaid is left unchanged (falls back to a framed code block)', () => {
    const [code] = render('```mermaid\n@@@invalid@@@\n```')
    expect(code?.lang).toBe('mermaid')
    expect(code?.text).toBe('@@@invalid@@@')
  })

  test('renders fences nested in lists and blockquotes', () => {
    const md =
      '- item\n\n  ```mermaid\n  graph TD\n  A --> B\n  ```\n\n> ```mermaid\n> graph TD\n> C --> D\n> ```'
    const codes = render(md)
    expect(codes).toHaveLength(2)
    for (const c of codes) expect(c.lang).toBe(MERMAID_ASCII_LANG)
  })

  test('a mermaid fence quoted inside a wider fence is not rendered', () => {
    const md = '````md\n```mermaid\ngraph TD\nA --> B\n```\n````'
    const [code] = render(md)
    expect(code?.lang).toBe('md')
    expect(code?.text).toContain('graph TD')
  })
})

describe('renderDiagramBlocks: dot', () => {
  test.each(['dot', 'graphviz'])('renders a %s fence as ascii art', lang => {
    const [code] = render('```' + lang + '\ndigraph g { a -> b; }\n```')
    expect(code?.lang).toBe(MERMAID_ASCII_LANG)
    expect(code?.text).not.toContain('digraph')
  })

  test('untranslatable dot is left unchanged', () => {
    const [code] = render('```dot\ndigraph g { a [shape=record, label="<f0>x"]; }\n```')
    expect(code?.lang).toBe('dot')
  })

  test('non-diagram fences are untouched', () => {
    const [code] = render('```ts\nconst a = 1\n```')
    expect(code?.lang).toBe('ts')
    expect(code?.text).toBe('const a = 1')
  })
})
