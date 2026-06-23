import type { TocEntry } from './ast'
import { inlineVisibleWidth } from './inline-width'

const MARKER_WIDTH = 2 // marker glyph + trailing space
const INDENT_PER_LEVEL = 2

export { inlineVisibleWidth }

export function tocContentWidth(toc: TocEntry[]): number {
  let max = 0
  const visit = (entries: TocEntry[]): void => {
    for (const e of entries) {
      const w = INDENT_PER_LEVEL * (e.level - 1) + MARKER_WIDTH + inlineVisibleWidth(e.inline)
      if (w > max) max = w
      if (e.children.length) visit(e.children)
    }
  }
  visit(toc)
  return max
}

export function findCurrent(toc: TocEntry[], id: string | null): TocEntry | null {
  if (!id) return null
  for (const e of toc) {
    if (e.id === id) return e
    const sub = findCurrent(e.children, id)
    if (sub) return sub
  }
  return null
}

export function flattenVisible(toc: TocEntry[], expanded: Map<string, boolean>): TocEntry[] {
  const out: TocEntry[] = []
  walk(toc, expanded, out)
  return out
}

function walk(entries: TocEntry[], expanded: Map<string, boolean>, out: TocEntry[]): void {
  for (const e of entries) {
    out.push(e)
    const isExpanded = expanded.get(e.id) ?? defaultExpanded(e)
    if (isExpanded && e.children.length) walk(e.children, expanded, out)
  }
}

function defaultExpanded(e: TocEntry): boolean {
  return e.level <= 2
}
