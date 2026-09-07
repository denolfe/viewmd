import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from './App'
import { buildTree } from './lib/ast'

const docWithRules = (rules: number) =>
  ['# Title', '', ...Array.from({ length: rules }, (_, i) => `para ${i}\n\n---\n`)].join('\n')

async function mountAndCountResizeListeners(markdown: string) {
  const { nodes, toc, headingIds } = buildTree(markdown)
  const { renderer, flush, renderOnce } = await createTestRenderer({ width: 80, height: 20 })

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
  await flush({ maxPasses: 30 })
  await new Promise(r => setTimeout(r, 40))
  await renderOnce()

  const count = renderer.listenerCount('resize')
  renderer.destroy()
  return count
}

/**
 * Block components must read layout width from context, not `useTerminalDimensions`:
 * that hook subscribes to the renderer's `resize` event per call site, and once the
 * count passes 10 Node prints a MaxListenersExceededWarning to stderr — over the
 * live TUI, corrupting the screen.
 */
test('resize listeners do not grow with the document', async () => {
  const few = await mountAndCountResizeListeners(docWithRules(2))
  const many = await mountAndCountResizeListeners(docWithRules(40))

  expect(many).toBe(few)
  expect(many).toBeLessThan(10)
})
