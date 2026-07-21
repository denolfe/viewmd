const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)(?:\r?\n)?---(?:\r?\n|$)/

// Synthetic heading id for the frontmatter block. Prefixed with NUL (like
// FILE_ROW_ID) so it can never collide with a real heading slug, letting n/N
// treat frontmatter as the topmost navigation stop.
export const FRONTMATTER_ID = '\x00frontmatter'

export function splitFrontmatter(markdown: string): {
  frontmatter: string | null
  body: string
} {
  const m = FRONTMATTER_REGEX.exec(markdown)
  if (!m || m.index !== 0) return { frontmatter: null, body: markdown }
  return { frontmatter: m[1] ?? '', body: markdown.slice(m[0].length) }
}

export type FrontmatterRow =
  | { kind: 'inline'; key: string; value: string }
  | { kind: 'raw'; key: string; lines: string[] }

const INLINE_REGEX = /^([A-Za-z_][\w-]*):[ \t]+(\S.*?)\s*$/
const KEY_ONLY_REGEX = /^([A-Za-z_][\w-]*):\s*$/
const CHILD_REGEX = /^([ \t]+|-\s)/

export function parseFrontmatter(inner: string): FrontmatterRow[] {
  if (inner.trim() === '') return []

  const lines = inner.split(/\r?\n/)
  const rows: FrontmatterRow[] = []
  const stray: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim() === '') {
      i++
      continue
    }

    const keyOnlyMatch = KEY_ONLY_REGEX.exec(line)
    if (keyOnlyMatch) {
      const key = keyOnlyMatch[1] ?? ''
      const children: string[] = []
      i++
      while (i < lines.length) {
        const child = lines[i] ?? ''
        if (child.trim() === '') {
          i++
          continue
        }
        if (!CHILD_REGEX.test(child)) break
        children.push(child)
        i++
      }
      rows.push({ kind: 'raw', key, lines: children })
      continue
    }

    const inlineMatch = INLINE_REGEX.exec(line)
    if (inlineMatch) {
      rows.push({ kind: 'inline', key: inlineMatch[1] ?? '', value: inlineMatch[2] ?? '' })
      i++
      continue
    }

    stray.push(line)
    i++
  }

  if (stray.length > 0) rows.push({ kind: 'raw', key: '', lines: stray })
  return rows
}
