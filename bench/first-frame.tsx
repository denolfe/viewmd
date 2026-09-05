// Time from process start to the first non-blank interactive frame, headless.
// Usage: bun bench/first-frame.tsx <doc.md>
import { addDefaultParsers } from '@opentui/core'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { App } from '../src/app/App'
import { buildDocument } from '../src/app/lib/loadDocument'
import { extraParsers } from '../src/app/parsers'

const file = process.argv[2]
if (!file) {
  console.error('usage: bun bench/first-frame.tsx <doc.md>')
  process.exit(1)
}

const md = await Bun.file(file).text()
// buildDocument, not buildTree: it runs the real pipeline (frontmatter split,
// mermaid/DOT preprocessing, heading lines), so the timing matches the CLI.
const tParse = performance.now()
const { nodes, toc, headingIds, frontmatter, fileLabel, headingLines } = buildDocument(md, file)
const parseMs = performance.now() - tParse

addDefaultParsers(extraParsers)
const setup = await createTestRenderer({ width: 120, height: 40, targetFps: 240 })
setup.renderer.setMaxListeners(0)

flushSync(() => {
  createRoot(setup.renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={frontmatter}
      fileLabel={fileLabel}
      headingLines={headingLines}
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
// Total is from process start; parse is the buildDocument slice of it, so the
// remainder is startup + renderer init + mount.
console.log(
  `first-frame ${performance.now().toFixed(1)}ms  (parse ${parseMs.toFixed(1)}ms, nodes=${nodes.length})`,
)
process.exit(0)
