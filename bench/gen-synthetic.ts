// Generates bench/synthetic.md (~10× test/exhaustive.md) for scaling-curve benchmarks.
const COPIES = 10

const base = await Bun.file(new URL('../test/exhaustive.md', import.meta.url)).text()
const doc = Array.from({ length: COPIES }, (_, i) => `# Synthetic copy ${i + 1}\n\n${base}`).join(
  '\n\n',
)
await Bun.write(new URL('synthetic.md', import.meta.url), doc)
console.log(`wrote bench/synthetic.md (${doc.length} bytes, ${COPIES} copies)`)
