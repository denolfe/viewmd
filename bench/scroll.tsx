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
// set spans that range: a short doc, a mid-sized one, and long-document.md
// (1200 lines, 51 headings, ~2000 renderables) where the cost shows up.
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
  // A fixed iteration count under-drains big docs, so loop until the
  // renderable count stops growing.
  const mountStart = performance.now()
  let stableFor = 0
  let lastCount = -1
  for (let i = 0; i < 3000 && stableFor < 5; i++) {
    await setup.flush()
    await sleep(1)
    await setup.renderOnce()
    const count = countTree(setup.renderer.root)
    stableFor = count === lastCount ? stableFor + 1 : 0
    lastCount = count
  }
  const mountMs = performance.now() - mountStart
  if (stableFor < 5) {
    console.error(`${file}: tree never stabilized while draining the progressive mount`)
    process.exit(1)
  }
  setup.mockInput.pressKey('x') // terminal capability handshake eats the first key

  // Every step below is timed the same way: keypress plus one render pass.
  // Deferred follow-ups (mark rechecks) run in a later task and are drained
  // between loops, not inside the timed window.
  const timeStep = async (key: string): Promise<number> => {
    const t0 = performance.now()
    setup.mockInput.pressKey(key)
    await setup.renderOnce()
    return performance.now() - t0
  }
  const drain = async () => {
    await setup.flush()
    await sleep(0)
    await setup.renderOnce()
  }

  const steps: number[] = []
  for (let i = 0; i < 200; i++) steps.push(await timeStep('j'))

  // Match ticks paint over the thumb glyphs as soon as a pattern is typed, so a
  // dense pattern erases every trace of the thumb. Locate the column now, while
  // no search exists.
  const scrollbarCol = findScrollbarColumn(setup.captureCharFrame())
  if (scrollbarCol === -1) {
    console.error(`${file}: no scrollbar thumb found — document may fit in the viewport`)
    process.exit(1)
  }

  // Committing a search resolves every match to a row and the overlay rechecks
  // its marks on each scroll, so a long document with many matches is where that
  // cost shows. `e` hits most English prose.
  // Opening the bar mounts a focused <input>, and a pattern typed before it lands
  // nowhere. The timing is racy here, so retry until the live counter proves the
  // pattern took; retries run before the clock starts.
  const settleInput = async () => {
    await setup.flush()
    await sleep(5)
    await setup.renderOnce()
  }
  let isOpen = false
  for (let attempt = 0; attempt < 20 && !isOpen; attempt++) {
    await setup.mockInput.typeText('/')
    await settleInput()
    await setup.mockInput.typeText('e')
    await settleInput()
    isOpen = /\d+ of \d+/.test(setup.captureCharFrame())
    if (!isOpen) {
      setup.mockInput.pressKey('escape')
      await settleInput()
    }
  }
  if (!isOpen) {
    console.error(`${file}: could not open the search bar after 20 attempts`)
    process.exit(1)
  }
  const t1 = performance.now()
  setup.mockInput.pressEnter()
  await setup.renderOnce()
  // Mark resolution is deferred past the commit and lands a variable number of
  // tasks later, so drain until ticks appear: the reader waits for them either way.
  // A search that never committed fails silently, reporting fast numbers for work
  // that never happened; ticks in the scrollbar column are the observable proof.
  let hasTicks = false
  for (let i = 0; i < 50 && !hasTicks; i++) {
    await setup.flush()
    await sleep(0)
    await setup.renderOnce()
    hasTicks = countTicks(setup.captureCharFrame(), scrollbarCol) > 0
  }
  const commit = performance.now() - t1
  if (!hasTicks) {
    console.error(`${file}: search never committed — no match ticks in the scrollbar column`)
    process.exit(1)
  }

  const litSteps: number[] = []
  for (let i = 0; i < 60; i++) {
    litSteps.push(await timeStep('j'))
    await drain()
  }

  const matchSteps: number[] = []
  for (let i = 0; i < 20; i++) {
    matchSteps.push(await timeStep('n'))
    await drain()
  }

  console.log(
    `${file}\n  nodes=${nodes.length} headings=${headingIds.length}` +
      ` renderables=${countTree(setup.renderer.root)}  full mount=${mountMs.toFixed(0)}ms` +
      `\n  step p50=${pct(steps, 0.5)}ms p95=${pct(steps, 0.95)}ms` +
      `\n  search matches=${findMatches(nodes, 'e').length}  commit=${commit.toFixed(1)}ms` +
      `\n  step under search p50=${pct(litSteps, 0.5)}ms p95=${pct(litSteps, 0.95)}ms` +
      `\n  stepMatch(n) p50=${pct(matchSteps, 0.5)}ms p95=${pct(matchSteps, 0.95)}ms`,
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

/** Rightmost column holding the thumb's block glyphs, or -1 when no scrollbar is drawn. */
function findScrollbarColumn(frame: string): number {
  const lines = frame.split('\n')
  const width = Math.max(...lines.map(l => l.length))
  for (let col = width - 1; col >= 0; col--) {
    const isThumb = lines.filter(l => '█▀▄'.includes(l[col] ?? '')).length >= 2
    if (isThumb) return col
  }
  return -1
}

/** Match ticks in one column; the same glyphs appear in table rules, so the column matters. */
function countTicks(frame: string, col: number): number {
  return frame.split('\n').filter(l => '─═'.includes(l[col] ?? '')).length
}
