import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'
import { tocContentWidth } from '../lib/toc-util'

// A short TOC (2 headings, fits the viewport — no TOC scrollbar once settled)
// paired with a large body so the Viewer's progressive-mount growth loop keeps
// the JS thread busy right after first paint, mirroring the README repro
// where that busy loop is what makes the TOC's one-frame flash visible.
const FIXTURE = [
  '# A',
  '',
  'text',
  '',
  ...Array.from({ length: 400 }, (_, i) => `filler paragraph ${i}`),
  '',
  '## B',
  '',
  'text',
].join('\n')

const TERM_WIDTH = 120
const TERM_HEIGHT = 30
// Mirror App.tsx layout constants: TOC scrollbox paddingX (2) + 1 buffer, and
// the viewer's scrollbar (1) + inner paddingRight (1).
const TOC_PADDING = 3
const VIEWER_OVERHEAD = 2
const CONTENT_MAX_WIDTH = 100

/**
 * First column of the TOC box, derived the way App lays the row out: the TOC
 * box (width clamped to [16, 40% of terminal]) sits immediately after the
 * viewer, whose width is contentWidth (capped at CONTENT_MAX_WIDTH) + overhead.
 * The viewer's own legitimate, persistent scrollbar occupies the column just
 * left of this boundary and must not trip the flash assertion.
 */
const tocColumnStartFor = (toc: Parameters<typeof tocContentWidth>[0]): number => {
  const tocWidth = Math.min(
    Math.floor(TERM_WIDTH * 0.4),
    Math.max(16, tocContentWidth(toc) + TOC_PADDING),
  )
  const contentWidth = Math.min(CONTENT_MAX_WIDTH, TERM_WIDTH - tocWidth - VIEWER_OVERHEAD)
  return contentWidth + VIEWER_OVERHEAD
}

const THUMB_GLYPHS = ['█', '▀', '▄']

/** True if any row has a thumb glyph within the TOC's columns (col >= boundary). */
const hasTocThumbFlash = (frame: string, tocColumnStart: number): boolean =>
  frame.split('\n').some(line => {
    for (let c = tocColumnStart; c < line.length; c++) {
      if (THUMB_GLYPHS.includes(line[c] ?? '')) return true
    }
    return false
  })

/**
 * Renders the real App headlessly and captures the terminal buffer on every
 * `frame` event (the renderer's actual paint boundary) from the first render
 * through settling. `renderOnce`/manual polling loops don't reliably line up
 * with these paint boundaries — the scrollbar's bad first-pass metrics only
 * ever surface on the renderer's own `frame` event, which is also what the
 * fix listens on to correct it.
 */
const captureFramesThroughSettle = async (md: string) => {
  const { nodes, toc, headingIds } = buildTree(md)
  const { renderer, flush, captureCharFrame } = await createTestRenderer({
    width: TERM_WIDTH,
    height: TERM_HEIGHT,
  })
  const frames: string[] = []
  renderer.on('frame', () => frames.push(captureCharFrame()))

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

  await flush({ maxPasses: 60 })
  await new Promise(r => setTimeout(r, 60))
  const settledFrame = captureCharFrame()
  renderer.destroy()
  return { toc, frames, settledFrame }
}

test('TOC scrollbar does not flash on the first painted frame', async () => {
  const { toc, frames, settledFrame } = await captureFramesThroughSettle(FIXTURE)
  const tocColumnStart = tocColumnStartFor(toc)

  expect(frames.length).toBeGreaterThan(0)
  for (const frame of frames) {
    expect(hasTocThumbFlash(frame, tocColumnStart)).toBe(false)
  }

  // Sanity: the TOC column itself renders its entries (visible, sans scrollbar).
  const tocSlice = settledFrame
    .split('\n')
    .map(line => line.slice(tocColumnStart))
    .join('\n')
  expect(tocSlice).toContain('▾ A')
  expect(tocSlice).toContain('• B')
})
