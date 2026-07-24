import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

const FIXTURE = ['# Title', '', 'Some body text.', '', '## Section', '', 'More text.'].join('\n')

test('? opens the help panel and ? closes it', async () => {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, mockInput, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 80,
    height: 24,
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

  await mockInput.typeText('x') // throwaway: first key eaten by the capability handshake
  await settle()

  await mockInput.typeText('?')
  await settle()
  let frame = captureCharFrame()
  expect(frame).toContain('Keyboard shortcuts')
  expect(frame).toContain('Scroll line')

  await mockInput.typeText('?')
  await settle()
  frame = captureCharFrame()
  expect(frame).not.toContain('Scroll line')

  renderer.destroy()
})
