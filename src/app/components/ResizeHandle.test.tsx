import { test, expect } from 'bun:test'
import { createTestRenderer, createMockMouse, MouseButtons } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

// "Sibling" is pushed well below the initial viewport by filler lines, so it
// only ever appears in the TOC pane — never in the viewer's visible rows. The
// TOC packs immediately right of the content, so its left edge (and thus
// Sibling's column) tracks the content width: a wider content pushes it right.
const FIXTURE = [
  '# Title',
  '',
  ...Array.from({ length: 30 }, (_, i) => `filler ${i}`),
  '',
  '## Parent',
  '',
  '### Child',
  '',
  ...Array.from({ length: 40 }, (_, i) => `more filler ${i}`),
  '',
  '## Sibling',
  '',
  'sibling body text',
].join('\n')

// Wider than CONTENT_MAX_WIDTH (100) so content starts capped with slack on the
// right — the exact wide-terminal case where the seam drag must grow content.
async function renderApp() {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 140,
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
      fileLabel="t/fix.md"
      headingLines={{}}
    />,
  )
  await settle()
  return { renderer, settle, captureCharFrame }
}

/** Locates the row/col of the first (and only) occurrence of `label`. */
function findLabelRowCol(lines: string[], label: string): { row: number; col: number } {
  for (let row = 0; row < lines.length; row++) {
    const col = lines[row]?.indexOf(label) ?? -1
    if (col >= 0) return { row, col }
  }
  throw new Error(`label "${label}" not found in frame`)
}

/**
 * The resize handle is a normally-invisible 1-col strip at the content/TOC seam
 * that only renders a '▏' glyph while hovered. Sweeping leftward from a known
 * TOC-pane column hovers each candidate column until the glyph appears, which
 * locates the handle's absolute terminal column without hardcoding widths.
 */
async function findHandleCol(
  mouse: ReturnType<typeof createMockMouse>,
  settle: () => Promise<void>,
  captureCharFrame: () => string,
  row: number,
  searchFrom: number,
): Promise<number> {
  for (let col = searchFrom; col >= 0; col--) {
    await mouse.moveTo(col, row)
    await settle()
    const line = captureCharFrame().split('\n')[row] ?? ''
    if (line[col] === '▏') return col
  }
  throw new Error('resize handle column not found')
}

// Uses the built-in mouse.drag(), whose first interpolated motion event lands
// OFF the 1-col handle — exactly how a real terminal reports a drag. OpenTUI
// binds drag-capture to the first drag event's hit-target, so resize must
// survive the pointer immediately leaving the handle's column; the full-screen
// drag shield is what makes that reliable in either direction.

test('dragging the seam right grows the content (TOC edge moves right)', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  const before = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  const handleCol = await findHandleCol(mouse, settle, captureCharFrame, before.row, before.col - 1)

  await mouse.drag(handleCol, before.row, handleCol + 12, before.row, MouseButtons.LEFT)
  await settle()

  const after = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(after.col).toBeGreaterThan(before.col)

  renderer.destroy()
})

test('dragging the seam left shrinks the content (TOC edge moves left)', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  const before = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  const handleCol = await findHandleCol(mouse, settle, captureCharFrame, before.row, before.col - 1)

  await mouse.drag(handleCol, before.row, handleCol - 12, before.row, MouseButtons.LEFT)
  await settle()

  const after = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(after.col).toBeLessThan(before.col)

  renderer.destroy()
})

test('double-click on the handle resets the content to its cap', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  const before = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  const handleCol = await findHandleCol(mouse, settle, captureCharFrame, before.row, before.col - 1)

  await mouse.drag(handleCol, before.row, handleCol + 12, before.row, MouseButtons.LEFT)
  await settle()

  const grown = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(grown.col).toBeGreaterThan(before.col)

  const newHandleCol = await findHandleCol(
    mouse,
    settle,
    captureCharFrame,
    grown.row,
    grown.col - 1,
  )
  await mouse.doubleClick(newHandleCol, grown.row, MouseButtons.LEFT)
  await settle()

  const reset = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(reset.col).toBe(before.col)

  renderer.destroy()
})

test('right-button drag does not resize', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  const before = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  const handleCol = await findHandleCol(mouse, settle, captureCharFrame, before.row, before.col - 1)

  await mouse.drag(handleCol, before.row, handleCol + 12, before.row, MouseButtons.RIGHT)
  await settle()

  const after = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(after.col).toBe(before.col)

  renderer.destroy()
})
