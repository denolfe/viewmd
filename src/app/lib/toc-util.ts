import type { TocEntry } from './ast'
import { inlineVisibleWidth } from './inline-width'

const MARKER_WIDTH = 2 // marker glyph + trailing space
const INDENT_PER_LEVEL = 2

export { inlineVisibleWidth }

export function walkToc(toc: TocEntry[], visit: (e: TocEntry, depth: number) => void): void {
  const go = (entries: TocEntry[], depth: number) => {
    for (const e of entries) {
      visit(e, depth)
      if (e.children.length) go(e.children, depth + 1)
    }
  }
  go(toc, 0)
}

export function findToc(toc: TocEntry[], pred: (e: TocEntry) => boolean): TocEntry | null {
  for (const e of toc) {
    if (pred(e)) return e
    const sub = findToc(e.children, pred)
    if (sub) return sub
  }
  return null
}

export function tocContentWidth(toc: TocEntry[]): number {
  let max = 0
  walkToc(toc, e => {
    const w = INDENT_PER_LEVEL * (e.level - 1) + MARKER_WIDTH + inlineVisibleWidth(e.inline)
    if (w > max) max = w
  })
  return max
}

export function findCurrent(toc: TocEntry[], id: string | null): TocEntry | null {
  if (!id) return null
  return findToc(toc, e => e.id === id)
}

// Not built on walkToc: prunes collapsed subtrees, so its traversal differs
// from the unconditional pre-order primitive.
export function flattenVisible(toc: TocEntry[], expanded: Map<string, boolean>): TocEntry[] {
  const out: TocEntry[] = []
  walkVisible(toc, expanded, out)
  return out
}

function walkVisible(entries: TocEntry[], expanded: Map<string, boolean>, out: TocEntry[]): void {
  for (const e of entries) {
    out.push(e)
    const isExpanded = expanded.get(e.id) ?? defaultExpanded(e)
    if (isExpanded && e.children.length) walkVisible(e.children, expanded, out)
  }
}

function defaultExpanded(e: TocEntry): boolean {
  return e.level <= 2
}
