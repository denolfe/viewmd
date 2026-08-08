import { describe, expect, test } from 'bun:test'
import { MERMAID_ASCII_LANG, replaceDotBlocks, replaceMermaidBlocks } from './preprocess'

describe('replaceMermaidBlocks', () => {
  test('converts mermaid fence to ascii art under the rendered-ascii info string', () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```'
    const out = replaceMermaidBlocks(md)
    expect(out.startsWith('```' + MERMAID_ASCII_LANG + '\n')).toBe(true)
    expect(out.endsWith('\n```')).toBe(true)
    expect(out).not.toContain('graph TD')
  })

  test('unrenderable mermaid is left unchanged (falls back to a framed code block)', () => {
    const md = '```mermaid\n@@@invalid@@@\n```'
    const out = replaceMermaidBlocks(md)
    expect(out).toBe(md)
  })
})

describe('replaceDotBlocks', () => {
  test.each(['dot', 'graphviz'])('renders a %s fence as ascii art', lang => {
    const md = '```' + lang + '\ndigraph g { a -> b; }\n```'
    const out = replaceDotBlocks(md)
    expect(out.startsWith('```' + MERMAID_ASCII_LANG + '\n')).toBe(true)
    expect(out).not.toContain('digraph')
  })

  test('untranslatable dot is left unchanged', () => {
    const md = '```dot\ndigraph g { a [shape=record, label="<f0>x"]; }\n```'
    expect(replaceDotBlocks(md)).toBe(md)
  })

  test('non-dot fences are untouched', () => {
    const md = '```ts\nconst a = 1\n```'
    expect(replaceDotBlocks(md)).toBe(md)
  })
})
