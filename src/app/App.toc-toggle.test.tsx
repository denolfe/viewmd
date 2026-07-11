import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { addDefaultParsers } from '@opentui/core'
import type { KeyEvent } from '@opentui/core'
import { testRender } from '@opentui/react/test-utils'
import { App } from './App'
import { buildTree } from './lib/ast'
import { extraParsers } from './parsers'

// Reconciler updates driven from keyInput.emit happen outside React's event
// system, so opt into the act environment to flush them deterministically.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
addDefaultParsers(extraParsers)

const SCROLLBAR_GLYPHS = '█▓░▌▐│┃▊▉'

// Columns containing a scrollbar glyph, so we can compare which scrollbars are
// drawn frame-to-frame regardless of the exact layout math.
function scrollbarCols(frame: string): Set<number> {
  const cols = new Set<number>()
  for (const line of frame.split('\n')) {
    for (let c = 0; c < line.length; c++) {
      if (SCROLLBAR_GLYPHS.includes(line[c]!)) cols.add(c)
    }
  }
  return cols
}

// A doc whose TOC fits within a wide viewport, so at steady state the TOC has
// no scrollbar of its own — the regime where a transient one is visible.
function fixtureDoc(): string {
  let md = '# Title\n\n'
  for (let i = 1; i <= 4; i++) {
    md += `## Section ${i}\n\n`
    for (let j = 0; j < 8; j++) md += `Body ${i}.${j} lorem ipsum dolor sit amet.\n\n`
  }
  return md
}

describe('TOC toggle', () => {
  // Regression: re-showing the TOC used to remount its scrollbox, which drew
  // the TOC's vertical scrollbar for a single frame before layout settled —
  // a visible flicker on wide terminals. Showing must not introduce any
  // scrollbar column that the settled shown state doesn't already have.
  test('showing the TOC does not flash a scrollbar', async () => {
    const { nodes, toc, headingIds } = buildTree(fixtureDoc())
    const setup = await testRender(
      <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="doc.md" />,
      { width: 160, height: 40 },
    )
    await setup.flush()

    const pressToggle = () =>
      setup.renderer.keyInput.emit('keypress', {
        name: 't',
        sequence: 't',
        ctrl: false,
        shift: false,
        meta: false,
        option: false,
        eventType: 'press',
        repeated: false,
      } as KeyEvent)

    const settledCols = scrollbarCols(setup.captureCharFrame())

    await act(async () => pressToggle()) // hide
    await setup.flush()

    await act(async () => pressToggle()) // show
    // Inspect each render pass of the show transition, not just the settled frame.
    for (let pass = 0; pass < 4; pass++) {
      await setup.renderOnce()
      const cols = scrollbarCols(setup.captureCharFrame())
      for (const c of cols) {
        expect(settledCols.has(c)).toBe(true)
      }
    }

    setup.renderer.destroy()
  })
})
