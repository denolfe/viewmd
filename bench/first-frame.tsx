// Time from process start to the first non-blank interactive frame, headless.
// Usage: bun bench/first-frame.tsx <doc.md> [--json] [--runs N]
//   --json      emit one machine-readable JSON line ({ metrics: { "first-frame" } })
//   --runs N    with --json, relaunch this script N times and report the p50/min
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    runs: { type: 'string' },
  },
})
const file = positionals[0]
if (!file) {
  console.error('usage: bun bench/first-frame.tsx <doc.md> [--json] [--runs N]')
  process.exit(1)
}
const runs = Number(values.runs ?? 1)

// --runs aggregates fresh subprocesses: process startup is a real slice of
// first-frame and can't be re-measured in-process, so each sample is its own launch.
if (values.json && runs > 1) {
  await aggregateRuns({ file, runs })
} else {
  await measureOnce({ file, asJson: values.json })
}

async function measureOnce(params: { file: string; asJson: boolean }): Promise<void> {
  const { file, asJson } = params
  const { addDefaultParsers } = await import('@opentui/core')
  const { createTestRenderer } = await import('@opentui/core/testing')
  const { createRoot, flushSync } = await import('@opentui/react')
  const { App } = await import('../src/app/App')
  const { buildDocument } = await import('../src/app/lib/loadDocument')
  const { extraParsers } = await import('../src/app/parsers')

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
  const firstFrameMs = performance.now()
  if (asJson) {
    console.log(
      JSON.stringify({
        doc: file,
        nodes: nodes.length,
        parseMs: Number(parseMs.toFixed(1)),
        metrics: { 'first-frame': Number(firstFrameMs.toFixed(1)) },
      }),
    )
  } else {
    console.log(
      `first-frame ${firstFrameMs.toFixed(1)}ms  (parse ${parseMs.toFixed(1)}ms, nodes=${nodes.length})`,
    )
  }
  process.exit(0)
}

async function aggregateRuns(params: { file: string; runs: number }): Promise<void> {
  const { file, runs } = params
  const samples: number[] = []
  let nodes = 0
  let parseMs = 0
  for (let i = 0; i < runs; i++) {
    const proc = Bun.spawn(['bun', import.meta.path, file, '--json'], {
      stdout: 'pipe',
      stderr: 'inherit',
    })
    const out = await new Response(proc.stdout).text()
    if ((await proc.exited) !== 0) {
      console.error(`first-frame: run ${i} exited non-zero`)
      process.exit(1)
    }
    const parsed = JSON.parse(out.trim())
    samples.push(parsed.metrics['first-frame'])
    nodes = parsed.nodes
    parseMs = parsed.parseMs
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(0.5 * (sorted.length - 1))] ?? 0
  console.log(
    JSON.stringify({
      doc: file,
      runs,
      nodes,
      parseMs,
      min: Number((sorted[0] ?? 0).toFixed(1)),
      samples: sorted.map(n => Number(n.toFixed(1))),
      metrics: {
        'first-frame': Number(p50.toFixed(1)),
      },
    }),
  )
  process.exit(0)
}
