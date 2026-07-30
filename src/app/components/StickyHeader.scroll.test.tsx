import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

// H1 then a deep H2, with enough filler that scrolling past the H2 pushes the
// H1's own text far off screen.
const FIXTURE = [
  '# Top Title',
  '',
  ...Array.from({ length: 40 }, (_, i) => `alpha ${i}`),
  '',
  '## Deep Section',
  '',
  ...Array.from({ length: 40 }, (_, i) => `beta ${i}`),
].join('\n')

/**
 * The current/visible heading state lives in its own context so scrolling does
 * not re-render the content tree. This asserts the overlay still tracks the
 * scroll: were that context dropped, or the heading state folded into a value
 * the overlay stops subscribing to, the ancestor rows would freeze and 'Top
 * Title' would appear nowhere once its own line scrolls away.
 */
test('the sticky overlay picks up the current heading while scrolling', async () => {
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
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} headingLines={{}} />,
  )
  await settle()
  // The very first key is consumed by the terminal capability handshake.
  await mockInput.typeText('x')
  await settle()
  // Hide the sidebar so heading text in the frame can only come from the
  // document body or the overlay.
  await mockInput.typeText('t')
  await settle()

  for (let i = 0; i < 45; i++) await mockInput.typeText('j')
  await settle()

  const frame = captureCharFrame()
  // Scrolled well past the top: the H1 line and the first filler are gone.
  expect(frame).not.toContain('alpha 0')
  // So the only thing that can still be painting the H1 is the ancestor row.
  expect(frame).toContain('Top Title')
  expect(frame).toContain('Deep Section')
})
