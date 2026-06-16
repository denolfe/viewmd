import { describe, expect, test } from 'bun:test'
import { replaceMermaidBlocks, replaceKbdTags, KBD_PREFIX, KBD_SUFFIX } from './preprocess'

describe('replaceMermaidBlocks', () => {
  test('converts mermaid fence to text fence with ascii art', () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```'
    const out = replaceMermaidBlocks(md)
    expect(out.startsWith('```text\n')).toBe(true)
    expect(out.endsWith('\n```')).toBe(true)
  })

  test('invalid mermaid is left unchanged', () => {
    const md = '```mermaid\n@@@invalid@@@\n```'
    const out = replaceMermaidBlocks(md)
    expect(out).toBe(md)
  })
})

describe('replaceKbdTags', () => {
  test('wraps kbd content with sentinel markers', () => {
    expect(replaceKbdTags('press <kbd>Esc</kbd>')).toBe(`press ${KBD_PREFIX}Esc${KBD_SUFFIX}`)
  })
})
