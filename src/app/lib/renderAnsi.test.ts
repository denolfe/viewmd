import { describe, expect, spyOn, test } from 'bun:test'
import { dlopen, suffix } from 'bun:ffi'
import { getTreeSitterClient } from '@opentui/core'
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

  test('trailing background padding on styled lines is trimmed', async () => {
    // H1 renders as a <text bg=... fg=...> with a single trailing space
    // ({` `} after the inline content) inside the styled span, so the raw
    // captured line ends in `... Hello \x1b[0m` — a space immediately before
    // the reset escape, not at the literal end of the string.
    const { nodes } = buildTree('# Hello\n')
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 200 })
    const headingLine = out.split('\n').find(l => stripAnsi(l).includes('Hello'))
    expect(headingLine).toBeDefined()
    // Assert directly on the raw (non-stripped) line: the trailing space must
    // be gone even though it sits inside the styled bg span, right before the
    // reset escape rather than at the string's literal end.
    expect(headingLine ?? '').not.toMatch(/ \x1b\[0m$/)
    expect(stripAnsi(headingLine ?? '')).not.toMatch(/ $/)
    // and the styling on 'Hello' itself is preserved (still has an escape)
    expect(headingLine ?? '').toMatch(/\x1b\[[0-9;]*m/)
  })

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

describe('renderAnsi capRows', () => {
  const bigDoc = (): string =>
    [
      '# Top',
      '',
      'first paragraph',
      '',
      '```typescript',
      'const visible = 1',
      '```',
      '',
      ...Array.from({ length: 300 }, (_, i) => `filler ${i}\n`),
      '```python',
      'below_the_fold = True',
      '```',
    ].join('\n')

  // maxHeight deliberately exceeds capRows: without the cap branch the
  // renderer emits ~300+ rows here, so these assertions gate the slicing
  // and hard truncation rather than the screen-height clip.
  test('output is truncated to capRows and keeps top content', async () => {
    const { nodes } = buildTree(bigDoc())
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 400, capRows: 40 })
    const plain = stripAnsi(out)
    expect(out.split('\n').length).toBeLessThanOrEqual(40)
    expect(plain).toContain('Top')
    expect(plain).toContain('const visible = 1')
    expect(plain).not.toContain('below_the_fold')
  })

  test('code inside the cap is highlighted', async () => {
    const { nodes } = buildTree(bigDoc())
    const out = await renderAnsi({ nodes, width: 80, maxHeight: 400, capRows: 40 })
    const codeLine = out.split('\n').find(l => stripAnsi(l).includes('const visible'))
    expect(codeLine).toBeDefined()
    expect(codeLine).toMatch(/\x1b\[[0-9;]*m/)
  })

  test('languages beyond the cap are never preloaded', async () => {
    const client = getTreeSitterClient()
    const preloadSpy = spyOn(client, 'preloadParser')
    try {
      const { nodes } = buildTree(bigDoc())
      await renderAnsi({ nodes, width: 80, maxHeight: 400, capRows: 40 })
      const langs = preloadSpy.mock.calls.map(call => call[0])
      expect(langs).toContain('typescript')
      expect(langs).not.toContain('python')
    } finally {
      preloadSpy.mockRestore()
    }
  })

  test('no capRows → unchanged output (regression guard)', async () => {
    const { nodes } = buildTree('# Hello\n\nA paragraph here.\n\n```ts\nconst x = 1\n```\n')
    const capped = await renderAnsi({ nodes, width: 80, maxHeight: 200 })
    const explicit = await renderAnsi({ nodes, width: 80, maxHeight: 200, capRows: undefined })
    expect(explicit).toBe(capped)
  })
})

test('contentMaxWidth narrows wrapping below the default cap', async () => {
  const nodes = buildTree('word '.repeat(60)).nodes
  const wide = await renderAnsi({ nodes, width: 200, maxHeight: 200 })
  const narrow = await renderAnsi({ nodes, width: 200, maxHeight: 200, contentMaxWidth: 30 })
  expect(narrow.split('\n').length).toBeGreaterThan(wide.split('\n').length)
})
