import { expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { ScrollBoxRenderable } from '@opentui/core'
import type { Renderable } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { collectTextBearers, isRuleBearer } from './Viewer'
import { buildTree } from '../lib/ast'
import { alignOffset, projectDocument, runElementCount } from '../lib/visible-text'

// Kitchen-sink doc: every projected block kind, with a table wide enough to
// wrap at the narrow renderer width. Locks projection ⇄ rendered text: if a
// renderer prints anything the projection doesn't predict (or vice versa),
// match offsets would drift off their rows.
const FIXTURE = [
  '# Top Title',
  '',
  '## Sub Heading',
  '',
  'Click [linktext **bold** here](https://example.com) and `spancode` plus ~~gone~~ now.  ',
  'after a hard break',
  '',
  '1. first ordered item',
  '2. second ordered item',
  '',
  '- [x] done task',
  '- [ ] open task',
  '',
  '- outer item',
  '  - inner item',
  '',
  '- > quoted inside item',
  '',
  '> block quoted text',
  '',
  // Empty cells (one in the wrapping row, one in a single-line row) exercise
  // the empty-run clamp: the cells after them must keep their element slots.
  '| Col | Wide |',
  '| --- | ---- |',
  '| | a wrapped zebra cell with many words forcing a wrap |',
  '| | zebra after empty |',
  '| ab | plain row |',
  '',
  '```ts',
  'const zebra = 1',
  '```',
  '',
  '```',
  'plain code line',
  '```',
  '',
  '![block alt](https://example.com/block.png)',
  '',
  'inline image ![tiny alt](https://example.com/t.png) here',
  '',
  '<details>',
  '<summary>Summary line</summary>',
  '',
  'details body text',
  '',
  '</details>',
  '',
  '<p align="center">',
  '  <a href="https://example.com/build"><img src="https://img.shields.io/x" alt="Build" /></a>',
  '  <a href="https://example.com/npm"><img src="https://img.shields.io/y" alt="npm" /></a>',
  '</p>',
  '',
  '<img alt="Logo" src="https://example.com/logo.png" />',
].join('\n')

const findScrollbox = (node: Renderable): ScrollBoxRenderable | null => {
  if (node instanceof ScrollBoxRenderable) return node
  for (const child of node.getChildren()) {
    const found = findScrollbox(child)
    if (found) return found
  }
  return null
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()

test('every projected run aligns into its block’s rendered text', async () => {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, flush, renderOnce } = await createTestRenderer({ width: 60, height: 80 })
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
      fileLabel="t/ks.md"
    />,
  )
  // Extra settles let the progressive-mount growth loop finish for the tail blocks.
  for (let i = 0; i < 10; i++) await settle()

  const box = findScrollbox(renderer.root)
  if (!box) throw new Error('scrollbox not found')

  const projections = projectDocument(nodes)
  expect(projections.length).toBeGreaterThan(15)
  for (const p of projections) {
    const blockBox = box.content.findDescendantById(p.blockElementId)
    if (!blockBox) throw new Error(`block not mounted: ${p.blockElementId}`)
    const bearers = collectTextBearers(blockBox, []).filter(b => !isRuleBearer(b.plainText))
    let base = 0
    for (const run of p.runs) {
      const count = runElementCount(run)
      for (let el = 0; el < count; el++) {
        const projected = run.segments
          .filter(s => s.element === el)
          .map(s => s.text)
          .join('')
        const bearer = bearers[base + el]
        if (!bearer) {
          throw new Error(`${p.blockElementId} run ${run.key} element ${el}: no bearer`)
        }
        const end = alignOffset(projected, bearer.plainText, projected.length)
        const rendered = bearer.plainText.slice(0, end)
        if (normalize(rendered) !== normalize(projected)) {
          throw new Error(
            `${p.blockElementId} run ${run.key} element ${el} drift:\n` +
              `  projected ${JSON.stringify(projected)}\n` +
              `  rendered  ${JSON.stringify(rendered)}`,
          )
        }
        // Each bearer is fully owned by its (run, element): anything past the
        // aligned end must be wrap/padding whitespace, never unprojected text.
        const tail = bearer.plainText.slice(end)
        if (normalize(tail) !== '') {
          throw new Error(
            `${p.blockElementId} run ${run.key} element ${el} suffix drift:\n` +
              `  rendered tail ${JSON.stringify(tail)}`,
          )
        }
      }
      base += Math.max(1, count)
    }
  }

  renderer.destroy()
})
