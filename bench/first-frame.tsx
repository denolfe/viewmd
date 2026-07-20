// Time from process start to the first non-blank interactive frame, headless.
// Usage: bun bench/first-frame.tsx <doc.md>
import { addDefaultParsers } from '@opentui/core'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { App } from '../src/app/App'
import { buildTree } from '../src/app/lib/ast'
import { splitFrontmatter } from '../src/app/lib/frontmatter'
import { replaceMermaidBlocks } from '../src/app/lib/preprocess'
import { extraParsers } from '../src/app/parsers'

const file = process.argv[2]
if (!file) {
  console.error('usage: bun bench/first-frame.tsx <doc.md>')
  process.exit(1)
}

const md = await Bun.file(file).text()
const { body } = splitFrontmatter(md)
const { nodes, toc, headingIds } = buildTree(replaceMermaidBlocks(body))

addDefaultParsers(extraParsers)
const setup = await createTestRenderer({ width: 120, height: 40, targetFps: 240 })
setup.renderer.setMaxListeners(0)

flushSync(() => {
  createRoot(setup.renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={[]}
      fileLabel="bench/doc"
      headingLines={{}}
    />,
  )
})
let hasFrame = false
for (let i = 0; i < 1000; i++) {
  await setup.renderOnce()
  if (setup.captureCharFrame().trim() !== '') {
    hasFrame = true
    break
  }
}
if (!hasFrame) {
  console.error('first-frame: no non-blank frame after 1000 render passes')
  process.exit(1)
}
console.log(`first-frame ${performance.now().toFixed(1)}ms`)
process.exit(0)
