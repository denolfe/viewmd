import { test, expect } from 'bun:test'
import { createTestRenderer, createMockMouse, MouseButtons } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

// A parent heading (Parent) with one child (Child), and a distant sibling
// (Sibling) far enough down the document that it starts outside the initial
// viewport — jumping to it is only observable if the click actually scrolled.
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

// The viewer renders raw '#' heading markers as part of its content (e.g. "###
// Child"), so plain substring checks against the whole frame can false-match
// viewer text. The TOC pane sits in the right ~16 cols of an 80-col frame;
// restrict TOC-only assertions to that region.
const TOC_PANE_MIN_COL = 40

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
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/fix.md" />,
  )
  await settle()
  return { renderer, settle, captureCharFrame }
}

function tocPaneContains(lines: string[], label: string): boolean {
  return lines.some(l => l.indexOf(label) >= TOC_PANE_MIN_COL)
}

/** Locates the row/col of the first occurrence of `label` in the TOC pane (right side of the frame). */
function findTocRow(lines: string[], label: string): { row: number; col: number } {
  for (let row = 0; row < lines.length; row++) {
    const col = lines[row]?.indexOf(label) ?? -1
    if (col >= TOC_PANE_MIN_COL) return { row, col }
  }
  throw new Error(`label "${label}" not found in TOC pane`)
}

function findMarkerCol(line: string): number {
  for (let c = 0; c < line.length; c++) {
    if (line[c] === '▾' || line[c] === '▸') return c
  }
  throw new Error(`no chevron marker found in line: ${JSON.stringify(line)}`)
}

test('clicking a leaf label jumps the viewer to that heading', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  expect(captureCharFrame()).not.toContain('sibling body text')

  const lines = captureCharFrame().split('\n')
  const { row, col } = findTocRow(lines, 'Sibling')
  await mouse.click(col + 1, row, MouseButtons.LEFT)
  await settle()

  const after = captureCharFrame()
  expect(after).toContain('Sibling')
  expect(after).toContain('sibling body text')

  renderer.destroy()
})

test('non-left mouse buttons are ignored', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  expect(captureCharFrame()).not.toContain('sibling body text')

  const lines = captureCharFrame().split('\n')
  const { row, col } = findTocRow(lines, 'Sibling')
  await mouse.click(col + 1, row, MouseButtons.RIGHT)
  await settle()

  expect(captureCharFrame()).not.toContain('sibling body text')

  renderer.destroy()
})

test('clicking a parent chevron toggles child visibility without jumping', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  const beforeLines = captureCharFrame().split('\n')
  expect(tocPaneContains(beforeLines, 'Child')).toBe(true)

  const { row } = findTocRow(beforeLines, 'Parent')
  const markerCol = findMarkerCol(beforeLines[row] ?? '')

  await mouse.click(markerCol, row, MouseButtons.LEFT)
  await settle()

  const collapsedLines = captureCharFrame().split('\n')
  expect(tocPaneContains(collapsedLines, 'Child')).toBe(false)
  // Toggling a chevron must not jump the viewer — the document top is unchanged.
  expect(collapsedLines.some(l => l.includes('filler 0'))).toBe(true)

  await mouse.click(markerCol, row, MouseButtons.LEFT)
  await settle()

  const expandedLines = captureCharFrame().split('\n')
  expect(tocPaneContains(expandedLines, 'Child')).toBe(true)

  renderer.destroy()
})

test('clicking a parent label jumps to that heading', async () => {
  const { renderer, settle, captureCharFrame } = await renderApp()
  const mouse = createMockMouse(renderer)

  // 30 filler lines push "## Parent" out of the initial viewport.
  expect(captureCharFrame()).not.toContain('## Parent')

  const lines = captureCharFrame().split('\n')
  const { row, col } = findTocRow(lines, 'Parent')
  await mouse.click(col + 1, row, MouseButtons.LEFT)
  await settle()

  const afterLines = captureCharFrame().split('\n')
  // A jump scrolls the target heading to the top of the viewport (below any
  // breadcrumb overlay rows), so it now shows up within the first few rows.
  const parentRow = afterLines.findIndex(l => l.includes('## Parent'))
  expect(parentRow).toBeGreaterThanOrEqual(0)
  expect(parentRow).toBeLessThanOrEqual(3)

  renderer.destroy()
})
