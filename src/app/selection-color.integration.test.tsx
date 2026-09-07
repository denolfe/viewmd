import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { RGBA } from '@opentui/core'
import { App } from './App'
import { buildTree } from './lib/ast'
import { theme } from './styles/theme'

const FIXTURE = ['# Title', '', 'alpha beta gamma delta', ''].join('\n')

const hex = (c: RGBA) =>
  `#${[c.r, c.g, c.b]
    .map(v =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`

/**
 * Guards the themed selection highlight: without the prototype seed OpenTUI
 * paints selections as reverse video (bg = the text's own fg).
 */
test('a live selection paints the themed gray, not reverse video', async () => {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, mockMouse, flush, renderOnce, captureCharFrame, captureSpans } =
    await createTestRenderer({ width: 80, height: 20 })
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
      fileLabel="t/fix.md"
    />,
  )
  await settle()

  const lines = captureCharFrame().split('\n')
  const row = lines.findIndex(line => line.includes('alpha beta gamma delta'))
  const startX = lines[row]?.indexOf('alpha') ?? -1
  expect(startX).toBeGreaterThan(-1)

  // Hold the drag open: the highlight is painted while the selection is live.
  await mockMouse.pressDown(startX, row)
  await mockMouse.moveTo(startX + 'alpha beta'.length, row)
  await settle()

  const spans = captureSpans().lines[row]?.spans ?? []
  const selected = spans.find(s => s.text.includes('alpha'))
  expect(selected).toBeDefined()
  expect(hex(selected?.bg ?? RGBA.fromValues(0, 0, 0, 0))).toBe(theme.selectionBg)

  await mockMouse.release(startX + 'alpha beta'.length, row)
  renderer.destroy()
})
