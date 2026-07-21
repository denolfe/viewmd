import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

const FIXTURE = ['# Title', '', 'body text'].join('\n')

test('idle status renders viewmd badge and filename on the bottom row', async () => {
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
      headingLines={{}}
      fileLabel="README.md"
      filePath="README.md"
    />,
  )
  await settle()

  const frame = captureCharFrame()
  expect(frame).toContain('viewmd')
  expect(frame).toContain('README.md')

  renderer.destroy()
})

test('error status takes over the status line then reverts to idle after the timeout', async () => {
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

  // No filePath: `onOpenEditor` short-circuits to an error status.
  createRoot(renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={[]}
      headingLines={{}}
      fileLabel="README.md"
    />,
  )
  await settle()

  // The very first key is consumed by the terminal capability handshake.
  await mockInput.typeText('x')
  await settle()
  // 'e' → openEditor action → error status (reading from stdin).
  await mockInput.typeText('e')
  await settle()

  expect(captureCharFrame()).toContain('Cannot edit')

  // The App reverts any non-idle status to idle after 2500ms.
  await new Promise(r => setTimeout(r, 2800))
  await settle()

  const reverted = captureCharFrame()
  expect(reverted).not.toContain('Cannot edit')
  expect(reverted).toContain('viewmd')

  renderer.destroy()
}, 10000)
