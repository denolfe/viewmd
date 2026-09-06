// Per-stage timing of the load pipeline. Usage: bun bench/stages.ts <doc.md> [iters]
const t0 = performance.now()
const { buildDocument } = await import('../src/app/lib/loadDocument')
const { buildTree, buildTreeFromTokens, lexMarkdown } = await import('../src/app/lib/ast')
const { renderDiagramBlocks } = await import('../src/app/lib/preprocess')
const { computeHeadingLines } = await import('../src/app/lib/headingLines')
const { splitFrontmatter } = await import('../src/app/lib/frontmatter')
const { findMatches } = await import('../src/app/lib/search')
const tImport = performance.now() - t0

const file = process.argv[2] ?? 'README.md'
const iters = Number(process.argv[3] ?? 10)
const md = await Bun.file(file).text()

const time = (label: string, fn: () => unknown) => {
  fn() // warm
  const ts: number[] = []
  for (let i = 0; i < iters; i++) {
    const s = performance.now()
    fn()
    ts.push(performance.now() - s)
  }
  ts.sort((a, b) => a - b)
  console.log(
    `${label.padEnd(22)} p50=${ts[Math.floor(ts.length / 2)]!.toFixed(2)}ms min=${ts[0]!.toFixed(2)}ms`,
  )
}
console.log(
  `${file}: ${md.length} chars, ${md.split('\n').length} lines; import=${tImport.toFixed(1)}ms`,
)
const { body } = splitFrontmatter(md)
time('splitFrontmatter', () => splitFrontmatter(md))
time('lexMarkdown', () => lexMarkdown(body))
const tokens = lexMarkdown(body)
time('computeHeadingLines', () => computeHeadingLines({ tokens, offset: 0 }))
time('renderDiagramBlocks', () => renderDiagramBlocks(lexMarkdown(body)))
time('buildTreeFromTokens', () => buildTreeFromTokens(tokens))
time('buildTree (lex+tree)', () => buildTree(body))
time('buildDocument (all)', () => buildDocument(md, file))
const { nodes } = buildDocument(md, file)
time("findMatches 'e'", () => findMatches(nodes, 'e'))
time("findMatches 'zzqx'", () => findMatches(nodes, 'zzqx'))
