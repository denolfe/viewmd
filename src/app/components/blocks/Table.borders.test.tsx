import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../../App'
import { buildTree } from '../../lib/ast'

// Cells whose text is long enough to wrap, and whose wrapping runs are styled
// (emphasis, link) or code — the shapes the width measurer has to agree with
// the renderer about.
const FIXTURE = [
  '# Tables',
  '',
  '| Tool | License | Mac? |',
  '|---|---|---|',
  '| MeshAnything V2 | S-Lab 1.0 *"for non-commercial purpose"*; HF card says MIT — unresolved | no |',
  '| MeshFlow | FAIR Noncommercial — *"will not use any outputs or results in connection with any commercial uses"* | no |',
  '| DeepMesh | [Apache-2.0 code and MIT weights, the only clean one](https://example.com) | no (`flash-attn`) |',
].join('\n')

/**
 * The row pipes are sized from wrapInline's line count while the cell text is
 * wrapped by the renderer. If the two disagree the pipes stop part-way down a
 * row and the table grows holes, so assert every row line carries a border at
 * every column the top rule defines.
 */
test('table borders are continuous through wrapped, styled cells', async () => {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 40,
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
      fileLabel="t/tables.md"
    />,
  )
  await settle()

  const lines = captureCharFrame().split('\n')
  const topRow = lines.findIndex(l => l.includes('┌'))
  const botRow = lines.findIndex(l => l.includes('└'))
  expect(topRow).toBeGreaterThanOrEqual(0)
  expect(botRow).toBeGreaterThan(topRow)

  const top = lines[topRow] ?? ''
  const borderCols = [...top].flatMap((ch, c) => ('┌┬┐'.includes(ch) ? [c] : []))
  expect(borderCols.length).toBe(4) // three columns

  const holes: string[] = []
  for (let row = topRow + 1; row < botRow; row++) {
    const line = lines[row] ?? ''
    for (const c of borderCols) {
      if (!'│├┼┤'.includes(line[c] ?? ' '))
        holes.push(`row ${row} col ${c}: ${JSON.stringify(line)}`)
    }
  }
  expect(holes).toEqual([])
})

const FLAT_FIXTURE = ['| Tool | License |', '|---|---|', '| A | MIT |', '| B | Apache-2.0 |'].join(
  '\n',
)

async function renderRows(markdown: string): Promise<string[]> {
  const { nodes, toc, headingIds } = buildTree(markdown)
  const { renderer, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 100,
    height: 40,
  })
  createRoot(renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={[]}
      headingLines={{}}
      fileLabel="t/tables.md"
    />,
  )
  await flush({ maxPasses: 20 })
  await new Promise(r => setTimeout(r, 30))
  await renderOnce()
  return captureCharFrame().split('\n')
}

// A table with a wrapped row reads as a wall of text without separators, so
// every body row gets a rule. Dense single-line tables stay compact.
test('body rows are separated by rules when any row wraps', async () => {
  const lines = await renderRows(FIXTURE)
  const ruleRows = lines.filter(l => l.includes('├'))
  expect(ruleRows.length).toBe(3) // header rule + one between each pair of the 3 body rows
})

test('single-line tables keep only the header rule', async () => {
  const lines = await renderRows(FLAT_FIXTURE)
  const ruleRows = lines.filter(l => l.includes('├'))
  expect(ruleRows.length).toBe(1)
})
