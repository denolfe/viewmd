import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

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

const THUMB_GLYPHS = ['█', '▀', '▄']

/** True if any row has a thumb glyph in the TOC's own scrollbar column (far right). */
const hasTocThumbFlash = (frame: string): boolean =>
  frame.split('\n').some(line => {
    for (let c = 102; c < line.length; c++) {
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
    width: 120,
    height: 30,
  })
  const frames: string[] = []
  renderer.on('frame', () => frames.push(captureCharFrame()))

  createRoot(renderer).render(
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/fix.md" />,
  )

  await flush({ maxPasses: 60 })
  await new Promise(r => setTimeout(r, 60))
  const settledFrame = captureCharFrame()
  renderer.destroy()
  return { frames, settledFrame }
}

test('TOC scrollbar does not flash on the first painted frame', async () => {
  const { frames, settledFrame } = await captureFramesThroughSettle(FIXTURE)

  expect(frames.length).toBeGreaterThan(0)
  for (const frame of frames) {
    expect(hasTocThumbFlash(frame)).toBe(false)
  }

  // Sanity: the TOC itself renders and the fixture's second heading is present.
  expect(settledFrame).toContain('B')
})
