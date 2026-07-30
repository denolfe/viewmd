// Per-scroll-step cost on a fully mounted document, headless.
// Usage: bun bench/scroll.tsx [doc.md...]   (defaults to DOCS below)
import { addDefaultParsers } from '@opentui/core'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { App } from '../src/app/App'
import { buildDocument } from '../src/app/lib/loadDocument'
import { findMatches } from '../src/app/lib/search'
import { extraParsers } from '../src/app/parsers'

// Scroll cost scales with heading count times renderable count, so the default
// set spans that range: a short doc, a mid-sized one, and long-document.md —
// 1200 lines, 51 headings, ~2000 renderables, which is where the cost shows up.
const DOCS = ['README.md', 'docs/ARCHITECTURE.md', 'test/long-document.md']

addDefaultParsers(extraParsers)

const files = process.argv.length > 2 ? process.argv.slice(2) : DOCS

// One document per process. Renderers share a TreeSitter client that
// `renderer.destroy()` tears down, so a second document in the same process
// mounts against a dead highlighter and silently measures the wrong thing.
if (files.length > 1) {
  for (const file of files) {
    const proc = Bun.spawn(['bun', import.meta.path, file], {
      stdout: 'inherit',
      stderr: 'inherit',
    })
    if ((await proc.exited) !== 0) process.exit(1)
  }
  process.exit(0)
}

for (const file of files) {
  const md = await Bun.file(file).text()
  // buildDocument, not buildTree: it runs the real pipeline (frontmatter split,
  // mermaid preprocessing), so the mounted tree matches what a reader scrolls.
  const { nodes, toc, headingIds, frontmatter } = buildDocument(md, file)
  const setup = await createTestRenderer({ width: 120, height: 40, targetFps: 240 })
  setup.renderer.setMaxListeners(0)
  flushSync(() =>
    createRoot(setup.renderer).render(
      <App
        nodes={nodes}
        toc={toc}
        headingIds={headingIds}
        frontmatter={frontmatter}
        headingLines={{}}
      />,
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

  // Committing a search resolves every match to a row, and the scrollbar overlay
  // re-checks its marks on each scroll — both walk the tree, so a long document
  // with many matches is where that cost shows. `e` hits most English prose.
  // Opening the bar mounts a focused <input>, and a pattern typed before that
  // lands nowhere — the timing is racy in the headless harness, so retry
  // until the live counter proves the pattern took. Retries happen before the
  // clock starts, so they can't inflate the commit measurement.
  const settleInput = async () => {
    await setup.flush()
    await sleep(5)
    await setup.renderOnce()
  }
  let opened = false
  for (let attempt = 0; attempt < 20 && !opened; attempt++) {
    await setup.mockInput.typeText('/')
    await settleInput()
    await setup.mockInput.typeText('e')
    await settleInput()
    opened = /\d+ of \d+/.test(setup.captureCharFrame())
    if (!opened) {
      setup.mockInput.pressKey('escape')
      await settleInput()
    }
  }
  if (!opened) {
    console.error(`${file}: could not open the search bar after 20 attempts`)
    process.exit(1)
  }
  const t1 = performance.now()
  await setup.mockInput.pressEnter()
  await setup.renderOnce()
  // Mark resolution is deferred past the commit, so drain before stopping the
  // clock: the reader waits for it either way.
  await setup.flush()
  await sleep(0)
  await setup.renderOnce()
  const commit = performance.now() - t1
  // The search phase is worthless if the pattern never reached the input — and it
  // fails silently, reporting fast numbers for work that never happened. Match
  // ticks in the scrollbar column are the observable proof it committed; the same
  // glyphs appear in table rules, so look only at that column.
  if (countTicksInScrollbarColumn(setup.captureCharFrame()) === 0) {
    console.error(`${file}: search never committed — no match ticks in the scrollbar column`)
    process.exit(1)
  }

  // The mark recheck runs in a deferred task, so drain it each step — renderOnce
  // alone returns before it and would report a cost the reader still pays.
  const lit = performance.now()
  for (let i = 0; i < 60; i++) {
    setup.mockInput.pressKey('j')
    await setup.renderOnce()
    await setup.flush()
    await sleep(0)
    await setup.renderOnce()
  }
  const litTotal = performance.now() - lit

  const steps2: number[] = []
  for (let i = 0; i < 20; i++) {
    const t = performance.now()
    setup.mockInput.pressKey('n')
    await setup.renderOnce()
    await setup.flush()
    await sleep(0)
    await setup.renderOnce()
    steps2.push(performance.now() - t)
  }

  console.log(
    `${file}\n  nodes=${nodes.length} headings=${headingIds.length}` +
      ` renderables=${countTree(setup.renderer.root)}` +
      `\n  step p50=${pct(steps, 0.5)}ms p95=${pct(steps, 0.95)}ms` +
      `\n  search matches=${findMatches(nodes, 'e').length}  commit=${commit.toFixed(1)}ms  60 steps under search=${litTotal.toFixed(0)}ms` +
      `\n  stepMatch(n) p50=${pct(steps2, 0.5)}ms p95=${pct(steps2, 0.95)}ms`,
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

/** Match ticks painted on the scrollbar column, located by the thumb's block glyphs. */
function countTicksInScrollbarColumn(frame: string): number {
  const lines = frame.split('\n')
  const width = Math.max(...lines.map(l => l.length))
  for (let col = width - 1; col >= 0; col--) {
    const isThumb = lines.filter(l => '█▀▄'.includes(l[col] ?? '')).length >= 2
    if (!isThumb) continue
    return lines.filter(l => '─═'.includes(l[col] ?? '')).length
  }
  return 0
}
