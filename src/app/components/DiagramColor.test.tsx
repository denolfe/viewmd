import { afterEach, expect, test } from 'bun:test'
import { RGBA } from '@opentui/core'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTreeFromTokens, lexMarkdown } from '../lib/ast'
import { renderDiagramBlocks } from '../lib/preprocess'
import { theme } from '../styles/theme'
import type { CliRenderer } from '@opentui/core'

const FIXTURE = ['# Diagram', '', '```mermaid', 'graph LR', '  A[Start] --> B[Done]', '```'].join(
  '\n',
)

let active: CliRenderer | undefined

afterEach(() => {
  active?.destroy()
  active = undefined
})

async function setup() {
  const { nodes, toc, headingIds } = buildTreeFromTokens(renderDiagramBlocks(lexMarkdown(FIXTURE)))
  const { renderer, mockInput, flush, renderOnce, captureSpans } = await createTestRenderer({
    width: 100,
    height: 20,
  })
  active = renderer
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
  return { mockInput, settle, captureSpans }
}

/** Every rendered span containing `text`; the search bar also echoes the query. */
function spansWith(
  captureSpans: Awaited<ReturnType<typeof createTestRenderer>>['captureSpans'],
  text: string,
) {
  return captureSpans().lines.flatMap(line => line.spans.filter(s => s.text.includes(text)))
}

const sameColor = (a: RGBA, hex: string) => {
  const b = RGBA.fromHex(hex)
  return [a.r - b.r, a.g - b.g, a.b - b.b].every(d => Math.abs(d) < 0.02)
}

test('each diagram node paints in its own palette hue', async () => {
  const { captureSpans } = await setup()
  expect(spansWith(captureSpans, 'Start').some(s => sameColor(s.fg, theme.diagramNodes[0]))).toBe(
    true,
  )
  expect(spansWith(captureSpans, 'Done').some(s => sameColor(s.fg, theme.diagramNodes[1]))).toBe(
    true,
  )
})

test('a search match inside a colored diagram keeps the match background', async () => {
  const { mockInput, settle, captureSpans } = await setup()
  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('Done')
  await settle()
  mockInput.pressEnter()
  await settle()
  const done = spansWith(captureSpans, 'Done')
  expect(done.some(s => s.text === 'Done' && sameColor(s.bg, theme.searchCurrentBg))).toBe(true)
})
