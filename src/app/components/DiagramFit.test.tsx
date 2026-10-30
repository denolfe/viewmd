import { expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTreeFromTokens, lexMarkdown } from '../lib/ast'
import { renderDiagramBlocks } from '../lib/preprocess'

const mermaid = (chain: string) =>
  ['# Diagram', '', '```mermaid', 'graph LR', `  ${chain}`, '```'].join('\n')

// At 160 cols the content column sits at the 100-col reading cap, leaving 96
// for a diagram between its margins.
async function renderFrame(md: string): Promise<string> {
  const { nodes, toc, headingIds } = buildTreeFromTokens(renderDiagramBlocks(lexMarkdown(md)))
  const { renderer, mockInput, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 160,
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
