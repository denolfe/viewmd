import { describe, expect, test } from 'bun:test'
import { dlopen, suffix } from 'bun:ffi'
import { buildTree } from './ast'
import { renderAnsi } from './renderAnsi'

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

describe('renderAnsi', () => {
  test('renders heading and paragraph text', async () => {
    const { nodes } = buildTree('# Hello\n\nA paragraph here.\n')
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 200 })
    const plain = stripAnsi(out)
    expect(plain).toContain('Hello')
    expect(plain).toContain('A paragraph here.')
  })

  test('renders fenced code block content', async () => {
    const { nodes } = buildTree('```\nconsole.log("hi")\n```\n')
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 200 })
    expect(stripAnsi(out)).toContain('console.log("hi")')
  })

  test('strips trailing blank lines', async () => {
    const { nodes } = buildTree('# Tiny\n')
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 200 })
    expect(out.endsWith('\n\n')).toBe(false)
  })

  test('emits ANSI escape codes (for color)', async () => {
    const { nodes } = buildTree('# Hello\n')
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 80 })
    expect(out).toMatch(/\x1b\[[0-9;]*m/)
  })

  test('does not bleed SGR styling across spans', async () => {
    // Inline code (`codespan`) uses a Pill with distinct fg/bg. The closing ▌
    // glyph carries the Pill's dark-gray fg; the plain text that follows must
    // carry its own white-fg escape rather than inheriting the Pill color.
    const { nodes } = buildTree('Plain text before `code` plain text after.\n')
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 80 })
    // Locate the pill closing glyph and "after" keyword.
    const pillCloseIdx = out.indexOf('▌')
    const afterIdx = out.indexOf('after')
    expect(pillCloseIdx).toBeGreaterThan(-1)
    expect(afterIdx).toBeGreaterThan(pillCloseIdx)
    // Between ▌ and "after" there must be at least one escape sequence
    // re-setting colors for the plain text span.
    const between = out.slice(pillCloseIdx, afterIdx)
    expect(between).toMatch(/\x1b\[[0-9;]+m/)
  })

  test('does not emit renderer-default white fg or black bg', async () => {
    // Pure 255;255;255 fg and 0;0;0 bg are the OpenTUI buffer fill defaults;
    // emitting them would force a black background on every terminal and
    // override the user's foreground.
    const { nodes } = buildTree('# Hello\n\nJust some prose.\n')
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 200 })
    expect(out).not.toMatch(/38;2;255;255;255/)
    expect(out).not.toMatch(/48;2;0;0;0/)
  })

  test('applies tree-sitter syntax highlighting to fenced code', async () => {
    // Plain code fence (no lang) has no parser; a `typescript` fence should
    // commit highlighted spans before capture.
    const plain = await renderAnsi({
      nodes: buildTree('```\nconst x = 1\n```\n').nodes,
      width: 80,
      maxHeight: 200,
    })
    const highlighted = await renderAnsi({
      nodes: buildTree('```typescript\nconst x = 1\n```\n').nodes,
      width: 80,
      maxHeight: 200,
    })
    const escCount = (s: string) => (s.match(/\x1b\[[0-9;]*m/g) ?? []).length
    expect(escCount(highlighted)).toBeGreaterThan(escCount(plain))
  })

  test.skipIf(process.platform === 'win32')(
    'leaves stdout blocking after render (OpenTUI sets O_NONBLOCK on fd 1)',
    async () => {
      // A non-blocking stdout makes Bun.write busy-spin at 100% CPU forever
      // when the pipe reader stalls or dies (orphaned-process bug).
      const { nodes } = buildTree('# Hello\n')
      await renderAnsi({ nodes, width: 80, maxHeight: 80 })
      const F_GETFL = 3
      const O_NONBLOCK = process.platform === 'darwin' ? 0x0004 : 0x0800
      const libc = dlopen(process.platform === 'darwin' ? `libc.${suffix}` : 'libc.so.6', {
        fcntl: { args: ['int', 'int', 'int'], returns: 'int' },
      })
      const flags = libc.symbols.fcntl(1, F_GETFL, 0)
      libc.close()
      expect(flags & O_NONBLOCK).toBe(0)
    },
  )

  test('trims rows that contain only ANSI background escapes', async () => {
    const { nodes } = buildTree('# One line\n')
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 500 })
    const lineCount = out.split('\n').length
    // A one-heading document should produce well under 50 rows of output,
    // not anywhere near maxHeight even though every "blank" row contains
    // theme-background ANSI codes.
    expect(lineCount).toBeLessThan(50)
  })
})
