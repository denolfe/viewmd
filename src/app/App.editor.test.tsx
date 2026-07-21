import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from './App'
import { buildTree } from './lib/ast'

// Pressing `e` with no filePath (stdin input) must flash the disable message and
// never reach openInEditor — so this branch is safe to exercise headlessly with
// no real process spawn.
test('pressing e without a filePath flashes the stdin-disable message', async () => {
  const { nodes, toc, headingIds } = buildTree('# Title\n\nbody\n')
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
  await mockInput.typeText('e')
  await settle()

  expect(captureCharFrame()).toContain('Cannot edit')

  renderer.destroy()
})
