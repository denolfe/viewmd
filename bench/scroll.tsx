// Per-scroll-step cost on a fully mounted document, headless.
// Usage: bun bench/scroll.tsx <doc.md>...
import { addDefaultParsers } from '@opentui/core'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { App } from '../src/app/App'
import { buildTree } from '../src/app/lib/ast'
import { extraParsers } from '../src/app/parsers'

addDefaultParsers(extraParsers)

for (const file of process.argv.slice(2)) {
  const md = await Bun.file(file).text()
  const { nodes, toc, headingIds } = buildTree(md)
  const setup = await createTestRenderer({ width: 120, height: 40, targetFps: 240 })
  setup.renderer.setMaxListeners(0)
  flushSync(() =>
    createRoot(setup.renderer).render(
      <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} headingLines={{}} />,
    ),
  )
  // Progressive mount grows one chunk per setTimeout(0) task; renderOnce alone
  // never drains that queue, so a bench without this measures a partial tree.
  for (let i = 0; i < 60; i++) {
    await setup.flush()
    await sleep(5)
    await setup.renderOnce()
  }
  setup.mockInput.pressKey('x') // terminal capability handshake eats the first key

  const steps: number[] = []
  for (let i = 0; i < 200; i++) {
    const t0 = performance.now()
    setup.mockInput.pressKey('j')
    await setup.renderOnce()
    steps.push(performance.now() - t0)
  }
  console.log(
    `${file}\n  nodes=${nodes.length} headings=${headingIds.length}` +
      ` renderables=${countTree(setup.renderer.root)}` +
      `\n  step p50=${pct(steps, 0.5)}ms p95=${pct(steps, 0.95)}ms`,
  )
  setup.renderer.destroy()
}
process.exit(0)

function pct(samples: number[], q: number): string {
  const sorted = [...samples].sort((a, b) => a - b)
  return (sorted[Math.floor(q * (sorted.length - 1))] ?? 0).toFixed(2)
}

function countTree(node: { getChildren?: () => unknown[] }): number {
  const kids = typeof node.getChildren === 'function' ? node.getChildren() : []
  let total = 1
  for (const k of kids) if (k && typeof k === 'object') total += countTree(k)
  return total
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
