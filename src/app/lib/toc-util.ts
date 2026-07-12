import type { InlineNode, TocEntry } from './ast'
import { inlineVisibleWidth } from './inline-width'

const MARKER_WIDTH = 2 // marker glyph + trailing space
const INDENT_PER_LEVEL = 2

export { inlineVisibleWidth }

export const FILE_ROW_ID = '\x00file-root'

export type BreadcrumbRow =
  | { id: string; variant: 'pill'; inline: InlineNode[] }
  | { id: string; variant: 'muted'; level: number; inline: InlineNode[] }

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

export function ancestorChain(toc: TocEntry[], id: string | null): TocEntry[] {
  if (!id) return []
  const path: TocEntry[] = []
  const walk = (entries: TocEntry[]): boolean => {
    for (const e of entries) {
      path.push(e)
      if (e.id === id) return true
      if (walk(e.children)) return true
      path.pop()
    }
    return false
  }
  return walk(toc) ? path : []
}

export function findCurrent(toc: TocEntry[], id: string | null): TocEntry | null {
  if (!id) return null
  return findToc(toc, e => e.id === id)
}

export function breadcrumbRows(params: {
  chain: TocEntry[]
  visibleHeadingIds: Set<string>
  hasH1: boolean
  fileLabel?: string
}): BreadcrumbRow[] {
  const { chain, visibleHeadingIds, hasH1, fileLabel } = params
  const crumbs = chain.filter(e => !visibleHeadingIds.has(e.id))
  if (crumbs.length === 0) return []

  const rows: BreadcrumbRow[] = []
  if (!hasH1 && fileLabel) {
    rows.push({ id: FILE_ROW_ID, variant: 'pill', inline: [{ kind: 'text', value: fileLabel }] })
  }
  for (const c of crumbs) {
    if (hasH1 && c.level === 1) rows.push({ id: c.id, variant: 'pill', inline: c.inline })
    else rows.push({ id: c.id, variant: 'muted', level: c.level, inline: c.inline })
  }
  return rows
}

// Rows the breadcrumb shows once `id` is the current heading: `id` itself is
// visible (filtered out); only its ancestor stack remains. This is the overlay
// height a jump pins below, and the tail reserve that keeps the last heading's
// content from scrolling up behind the overlay.
export function breadcrumbHeightForHeading(params: {
  toc: TocEntry[]
  id: string
  fileLabel?: string
}): number {
  const { toc, id, fileLabel } = params
  return breadcrumbRows({
    chain: ancestorChain(toc, id),
    visibleHeadingIds: new Set([id]),
    hasH1: toc[0]?.level === 1,
    fileLabel,
  }).length
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
