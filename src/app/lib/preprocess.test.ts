import { describe, expect, test } from 'bun:test'
import { MERMAID_ASCII_LANG, replaceMermaidBlocks } from './preprocess'

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
