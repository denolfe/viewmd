// Generates a large synthetic markdown fixture for benchmarks.
const sections = Number(process.argv[2] ?? 200)
const out: string[] = [
  '# Benchmark Document',
  '',
  'Intro paragraph with **bold**, _italic_, `code`, and a [link](https://example.com).',
  '',
]
for (let i = 0; i < sections; i++) {
  out.push(
    `## Section ${i}`,
    '',
    `Paragraph ${i} with some inline **strong** text and \`inline code\` that wraps across lines when the terminal is narrow enough to force wrapping behavior.`,
    '',
  )
  out.push(
    `### Sub ${i}.1`,
    '',
    '- item one',
    '- item two with **bold**',
    '  - nested item',
    '- item three',
    '',
  )
  out.push(
    '```ts',
    `export function fn${i}(a: number, b: string): string {`,
    `  const x = a * ${i}`,
    '  return `${b}:${x}`',
    '}',
    '```',
    '',
  )
  out.push(
    '| Col A | Col B | Col C |',
    '|---|---|---|',
    `| row ${i} | some longer cell text that may wrap | \`code\` |`,
    `| **bold** | _em_ | plain |`,
    '',
  )
  out.push('> blockquote line one', '> blockquote line two', '')
}
process.stdout.write(out.join('\n'))
