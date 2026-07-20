import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

// Deterministic fixture: 'zebra' appears on known lines spread far enough
// apart that ticks land on distinct track rows, with enough filler to scroll.
const FIXTURE = [
  '# Title',
  '',
  'zebra one',
  '',
  ...Array.from({ length: 30 }, (_, i) => `filler ${i}`),
  '',
  '## Middle',
  '',
  'zebra two',
  '',
  ...Array.from({ length: 30 }, (_, i) => `more ${i}`),
  '',
  '## End',
  '',
  'zebra three',
].join('\n')

/**
 * Renders the real App headlessly, runs a search, and asserts the tick glyphs
 * land on the same track rows computeTrackCells produced — i.e. no vertical
 * offset between the overlay and the scrollbar column. Guards against the
 * yoga row-shift bug where extra overlay children pushed every tick up a row.
 */
test('search ticks render on the scrollbar column without a row offset', async () => {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, mockInput, flush, renderOnce, captureCharFrame } = await createTestRenderer({
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
      headingLines={{}}
      fileLabel="t/fix.md"
    />,
  )
  await settle()

  // The very first key is consumed by the terminal capability handshake.
  await mockInput.typeText('x')
  await settle()
  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  mockInput.pressEnter()
  await settle()

  const lines = captureCharFrame().split('\n')
  // Scrollbar column: the one drawing thumb block glyphs.
  let barCol = -1
  for (let c = 0; c < 80 && barCol < 0; c++) {
    if (lines.filter(l => l[c] === '█' || l[c] === '▀' || l[c] === '▄').length >= 2) barCol = c
  }
  expect(barCol).toBeGreaterThan(0)

  const tickRows = lines
    .map((l, row) => ({ row, ch: l[barCol] }))
    .filter(({ ch }) => ch === '─' || ch === '═')
    .map(({ row }) => row)

  // 3 zebra matches spread over the document → 3 distinct tick rows: near the
  // top (but not row 0 — 'zebra one' sits below the title), around the middle,
  // and in the lower part of the track (the synthetic tail spacer keeps the
  // last content line short of the very bottom row).
  expect(tickRows).toHaveLength(3)
  const [first, mid, last] = tickRows
  expect(first).toBeGreaterThanOrEqual(1)
  expect(first).toBeLessThanOrEqual(3)
  expect(mid).toBeGreaterThanOrEqual(7)
  expect(mid).toBeLessThanOrEqual(11)
  expect(last).toBeGreaterThanOrEqual(13)
  expect(last).toBeLessThanOrEqual(17)

  renderer.destroy()
})
