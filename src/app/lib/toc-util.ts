import type { TocEntry } from './ast'
import { inlineVisibleWidth } from './inline-width'

const MARKER_WIDTH = 2 // marker glyph + trailing space
const INDENT_PER_LEVEL = 2

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

function tocEntryWidth(e: TocEntry): number {
  return INDENT_PER_LEVEL * (e.level - 1) + MARKER_WIDTH + inlineVisibleWidth(e.inline)
}

// Widest row across the whole tree, regardless of collapse state: the maximum
// the sidebar could ever need.
export function tocContentWidth(toc: TocEntry[]): number {
  let max = 0
  walkToc(toc, e => {
    const w = tocEntryWidth(e)
    if (w > max) max = w
  })
  return max
}

// Widest row among currently-visible entries. Collapsing a subtree that holds a
// wide heading drops it from the measurement, so the sidebar can shrink and the
// viewer reclaim the freed columns.
export function tocVisibleContentWidth(toc: TocEntry[], expanded: Map<string, boolean>): number {
  let max = 0
  for (const e of flattenVisible(toc, expanded)) {
    const w = tocEntryWidth(e)
    if (w > max) max = w
  }
  return max
}

// Not built on walkToc: prunes collapsed subtrees, so its traversal differs
// from the unconditional pre-order primitive.
export function flattenVisible(toc: TocEntry[], expanded: Map<string, boolean>): TocEntry[] {
  const out: TocEntry[] = []
  walkVisible(toc, expanded, out)
  return out
}

// Every entry defaults to expanded; the map only holds explicit user toggles.
export function isTocExpanded(e: TocEntry, expanded: Map<string, boolean>): boolean {
  return expanded.get(e.id) ?? true
}

export function toggleTocExpanded(params: {
  toc: TocEntry[]
  expanded: Map<string, boolean>
  id: string
}): Map<string, boolean> {
  const { toc, expanded, id } = params
  const entry = findToc(toc, e => e.id === id)
  if (!entry) return expanded
  const next = new Map(expanded)
  next.set(id, !isTocExpanded(entry, expanded))
  return next
}

function walkVisible(entries: TocEntry[], expanded: Map<string, boolean>, out: TocEntry[]): void {
  for (const e of entries) {
    out.push(e)
    if (isTocExpanded(e, expanded) && e.children.length) walkVisible(e.children, expanded, out)
  }
}
