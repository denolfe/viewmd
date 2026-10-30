import { expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTreeFromTokens, lexMarkdown } from '../lib/ast'
import { renderDiagramBlocks } from '../lib/preprocess'

const mermaid = (chain: string) =>
  ['# Diagram', '', '```mermaid', 'graph LR', `  ${chain}`, '```'].join('\n')

// 180 cols at default spacing, 136 at the tightest.
const HUGE_CHAIN = mermaid(
  'A[Keyboard event] --> B[mapKey pure] --> C[Action value] --> D[dispatch pure] --> E[Commands effectful] --> F[ViewActions write] --> G[React rerender] --> H[Terminal frame]',
)

// At 160 cols the content column sits at the 100-col reading cap, leaving 96
// for a diagram between its margins.
async function renderFrame(
  md: string,
  { width = 160, hideToc = false }: { width?: number; hideToc?: boolean } = {},
): Promise<string> {
  const { nodes, toc, headingIds } = buildTreeFromTokens(renderDiagramBlocks(lexMarkdown(md)))
  const { renderer, mockInput, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width,
    height: 20,
  })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  createRoot(renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={[]}
      headingLines={{}}
      fileLabel="t/diagram.md"
    />,
  )
  await settle()
  // The very first key is consumed by the terminal capability handshake.
  await mockInput.typeText('x')
  await settle()
  if (hideToc) {
    await mockInput.typeText('t')
    await settle()
  }
  return captureCharFrame()
}

test('a diagram wider than the content column re-renders to fit it', async () => {
  // 114 cols at default spacing.
  const frame = await renderFrame(
    mermaid(
      'A[Start here] --> B[Parse markdown] --> C[Build tree] --> D[Render React] --> E[Paint frame] --> F[Done all]',
    ),
  )
  // Tight spacing drops the padding inside boxes; the last box closes only when whole.
  expect(frame).toContain('Done all│')
})

test('a diagram exactly as wide as the column shows whole at default spacing', async () => {
  // 96 cols at default spacing.
  const frame = await renderFrame(
    mermaid(
      'A[Open file] --> B[Lex tokens] --> C[Render diagrams] --> D[Build tree] --> E[Mount viewer]',
    ),
  )
  expect(frame).toContain('│ Mount viewer │')
})

test('with the TOC shown, a diagram stops at the reading cap', async () => {
  const frame = await renderFrame(HUGE_CHAIN, { width: 200 })
  expect(frame).not.toContain('Terminal frame')
})

test('with the TOC hidden, a diagram breaks out past the reading cap', async () => {
  const frame = await renderFrame(HUGE_CHAIN, { width: 200, hideToc: true })
  expect(frame).toContain('│ Terminal frame │')
})

test('with the TOC hidden, prose keeps the reading width', async () => {
  const prose = `# Diagram\n\n${'word '.repeat(60)}`
  const shown = await renderFrame(prose, { width: 200 })
  const hidden = await renderFrame(prose, { width: 200, hideToc: true })
  const longestProse = (frame: string) =>
    Math.max(...frame.split('\n').map(l => l.match(/^.*word/)?.[0].length ?? 0))
  // Hiding the TOC hands prose the sidebar's columns, not the whole terminal.
  expect(longestProse(hidden)).toBeGreaterThan(longestProse(shown))
  expect(longestProse(hidden)).toBeLessThan(150)
})
