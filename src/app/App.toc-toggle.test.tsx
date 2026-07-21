import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { addDefaultParsers } from '@opentui/core'
import type { KeyEvent } from '@opentui/core'
import { testRender } from '@opentui/react/test-utils'
import { App } from './App'
import { buildTree } from './lib/ast'
import { extraParsers } from './parsers'

addDefaultParsers(extraParsers)

// testRender opts this file into React's act environment, so any state update it
// sees outside an act() scope warns. keyInput.emit runs outside React's event
// system and its follow-on reconciler work lands during flush/renderOnce, so
// wrap those pumps in act() too — not just the synchronous key presses. The
// trailing setTimeout(0) yield drains App's post-layout effects (visible-heading
// sync, progressive mount) inside act so their late state updates don't warn.
type Setup = Awaited<ReturnType<typeof testRender>>
const drainTimers = () => new Promise(resolve => setTimeout(resolve, 0))
const flush = (setup: Setup) =>
  act(async () => {
    await setup.flush()
    await drainTimers()
  })
const renderOnce = (setup: Setup) =>
  act(async () => {
    await setup.renderOnce()
    await drainTimers()
  })
// renderer.destroy() unmounts the React root via opentui's destroy-event
// handler, which runs outside testRender's own act-wrapped teardown — wrap it.
const destroy = (setup: Setup) => act(async () => void setup.renderer.destroy())

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

function pressKey(setup: Awaited<ReturnType<typeof testRender>>, name: string, sequence = name) {
  setup.renderer.keyInput.emit('keypress', {
    name,
    sequence,
    ctrl: false,
    shift: false,
    meta: false,
    option: false,
    eventType: 'press',
    repeated: false,
  } as KeyEvent)
}

describe('TOC expand', () => {
  // Regression: deep headings (h4/h5) must be visible in the TOC on open, and
  // the first space-press must flip relative to the effective default (a
  // stale `?? true` default once made the first toggle on an h3 a no-op).
  test('h4 is visible on open; space on its h3 parent hides it', async () => {
    // Enough body that the h4 heading is below the viewer fold — the only way
    // 'Deeper' can appear on screen is via the TOC.
    const filler = Array.from({ length: 60 }, (_, i) => `Body line ${i}.`).join('\n\n')
    const md = `# Title\n\n## Section\n\n### Deep\n\n${filler}\n\n#### Deeper\n\nBody.\n`
    const { nodes, toc, headingIds } = buildTree(md)
    const setup = await testRender(
      <App
        nodes={nodes}
        toc={toc}
        headingIds={headingIds}
        frontmatter={[]}
        headingLines={{}}
        fileLabel="doc.md"
      />,
      { width: 160, height: 40 },
    )
    await flush(setup)

    // First keypress is consumed by the terminal capability handshake.
    await act(async () => pressKey(setup, 'x'))
    await flush(setup)
    expect(setup.captureCharFrame()).toContain('Deeper')

    await act(async () => pressKey(setup, 'tab', '\t')) // focus sidebar (cursor on Title)
    await act(async () => pressKey(setup, 'j')) // Section
    await act(async () => pressKey(setup, 'j')) // Deep (h3)
    await act(async () => pressKey(setup, 'space', ' ')) // collapse Deep
    await flush(setup)
    await renderOnce(setup)
    expect(setup.captureCharFrame()).not.toContain('Deeper')

    await destroy(setup)
  })
})

describe('TOC collapse sizing', () => {
  // Leftmost column carrying a scrollbar thumb glyph — marks the viewer's right
  // edge, so a larger value means a wider viewer.
  function viewerScrollbarCol(frame: string): number {
    let min = Infinity
    for (const line of frame.split('\n')) {
      for (let c = 0; c < line.length; c++) {
        if ('█▀▄'.includes(line[c]!)) min = Math.min(min, c)
      }
    }
    return min
  }

  // Regression: the sidebar was sized from the widest heading in the whole tree,
  // ignoring collapse state, so collapsing a wide subtree never let the viewer
  // reclaim the freed columns. Collapsing the subtree holding the widest heading
  // must now widen the viewer.
  test('collapsing the widest subtree widens the viewer', async () => {
    const md =
      '# Doc\n\nBody text that wraps at narrow widths for this test.\n\n' +
      '## Alpha\n\nBody.\n\n' +
      '### This Is An Extremely Long Nested Subsection Heading That Dominates Width\n\nBody.\n\n' +
      '## Beta\n\nBody.\n'
    const { nodes, toc, headingIds } = buildTree(md)
    const setup = await testRender(
      <App
        nodes={nodes}
        toc={toc}
        headingIds={headingIds}
        frontmatter={[]}
        headingLines={{}}
        fileLabel="doc.md"
      />,
      { width: 70, height: 25 },
    )
    await flush(setup)

    await act(async () => pressKey(setup, 'x')) // consume handshake keypress
    await flush(setup)
    const before = viewerScrollbarCol(setup.captureCharFrame())

    await act(async () => pressKey(setup, 'tab', '\t')) // focus sidebar (cursor on Doc)
    await act(async () => pressKey(setup, 'j')) // Alpha
    await act(async () => pressKey(setup, 'space', ' ')) // collapse Alpha, hiding the long h3
    await flush(setup)
    await renderOnce(setup)
    const after = viewerScrollbarCol(setup.captureCharFrame())

    expect(after).toBeGreaterThan(before)

    await destroy(setup)
  })
})

describe('TOC toggle', () => {
  // Regression: re-showing the TOC used to remount its scrollbox, which drew
  // the TOC's vertical scrollbar for a single frame before layout settled —
  // a visible flicker on wide terminals. Showing must not introduce any
  // scrollbar column that the settled shown state doesn't already have.
  test('showing the TOC does not flash a scrollbar', async () => {
    const { nodes, toc, headingIds } = buildTree(fixtureDoc())
    const setup = await testRender(
      <App
        nodes={nodes}
        toc={toc}
        headingIds={headingIds}
        frontmatter={[]}
        headingLines={{}}
        fileLabel="doc.md"
      />,
      { width: 160, height: 40 },
    )
    await flush(setup)

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
    await flush(setup)

    await act(async () => pressToggle()) // show
    // Inspect each render pass of the show transition, not just the settled frame.
    for (let pass = 0; pass < 4; pass++) {
      await renderOnce(setup)
      const cols = scrollbarCols(setup.captureCharFrame())
      for (const c of cols) {
        expect(settledCols.has(c)).toBe(true)
      }
    }

    await destroy(setup)
  })
})
