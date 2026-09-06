import { expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'
import { collectById } from '../lib/renderable-tree'
import { tocRowId } from './Toc'

const HEADING_COUNT = 300
const HEIGHT = 20

const fixture = (): string =>
  Array.from({ length: HEADING_COUNT }, (_, i) => `## Heading ${i}\n\nbody ${i}\n`).join('\n')

test('TOC paints a screenful of rows first, then mounts the rest', async () => {
  const { nodes, toc, headingIds } = buildTree(fixture())
  const setup = await createTestRenderer({ width: 80, height: HEIGHT })
  setup.renderer.setMaxListeners(0)
  const wanted = new Set(headingIds.map(tocRowId))
  const mountedRows = (): number =>
    collectById({ root: setup.renderer.root, wanted, collect: () => true }).size

  // Synchronous first commit, before any growth tick has had a chance to fire.
  flushSync(() => {
    createRoot(setup.renderer).render(
      <App
        nodes={nodes}
        toc={toc}
        headingIds={headingIds}
        frontmatter={[]}
        headingLines={{}}
        fileLabel="t/fix.md"
      />,
    )
  })
  await setup.renderOnce()
  const firstPaint = mountedRows()
  expect(firstPaint).toBeGreaterThanOrEqual(HEIGHT)
  expect(firstPaint).toBeLessThan(HEADING_COUNT)

  // Growth runs one chunk per task; drain until every row is in the tree.
  for (let i = 0; i < 100 && mountedRows() < HEADING_COUNT; i++) {
    await setup.flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 5))
    await setup.renderOnce()
  }
  expect(mountedRows()).toBe(HEADING_COUNT)

  setup.renderer.destroy()
})
