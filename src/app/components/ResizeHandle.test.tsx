import { test, expect } from 'bun:test'
import { createTestRenderer, createMockMouse, MouseButtons } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

// "Sibling" is pushed well below the initial viewport by filler lines, so it
// only ever appears in the TOC pane — never in the viewer's visible rows —
// making its column an unambiguous proxy for the TOC pane's left edge.
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

async function renderApp() {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 80,
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
 * The resize handle is a normally-invisible 1-col strip that only renders a
 * '▏' glyph while hovered. Sweeping leftward from a known TOC-pane column
 * hovers each candidate column until the glyph appears, which locates the
 * handle's absolute terminal column without hardcoding padding/marker widths.
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
// survive the pointer immediately leaving the handle's column.

test('left-drag from the handle widens the sidebar (left edge moves left)', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  const before = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  const handleCol = await findHandleCol(mouse, settle, captureCharFrame, before.row, before.col - 1)

  await mouse.drag(handleCol, before.row, handleCol - 8, before.row, MouseButtons.LEFT)
  await settle()

  const after = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(after.col).toBeLessThan(before.col)

  renderer.destroy()
})

test('right-drag narrows the sidebar back (left edge moves right)', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  // Widen first — the fixture's TOC is at the 16-col floor, so there is no room
  // to narrow until we grow it.
  const start = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  const h0 = await findHandleCol(mouse, settle, captureCharFrame, start.row, start.col - 1)
  await mouse.drag(h0, start.row, h0 - 10, start.row, MouseButtons.LEFT)
  await settle()

  const widened = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  const h1 = await findHandleCol(mouse, settle, captureCharFrame, widened.row, widened.col - 1)

  // Drag right: the pointer moves into the TOC, a different capture target than
  // the widen case — this is what the full-screen drag shield makes reliable.
  await mouse.drag(h1, widened.row, h1 + 10, widened.row, MouseButtons.LEFT)
  await settle()

  const narrowed = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(narrowed.col).toBeGreaterThan(widened.col)

  renderer.destroy()
})

test('double-click on the handle resets the sidebar to auto width', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  const before = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  const handleCol = await findHandleCol(mouse, settle, captureCharFrame, before.row, before.col - 1)

  await mouse.drag(handleCol, before.row, handleCol - 8, before.row, MouseButtons.LEFT)
  await settle()

  const widened = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(widened.col).toBeLessThan(before.col)

  const newHandleCol = await findHandleCol(
    mouse,
    settle,
    captureCharFrame,
    widened.row,
    widened.col - 1,
  )
  await mouse.doubleClick(newHandleCol, widened.row, MouseButtons.LEFT)
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

  await mouse.drag(handleCol, before.row, handleCol - 8, before.row, MouseButtons.RIGHT)
  await settle()

  const after = findLabelRowCol(captureCharFrame().split('\n'), 'Sibling')
  expect(after.col).toBe(before.col)

  renderer.destroy()
})
