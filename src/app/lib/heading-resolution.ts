import { ancestorChain, backBadgeRowsForDepth, breadcrumbRows, documentHasH1 } from './toc-util'
import { findHeadingNearTop, findVisibleHeadingIds } from './viewport-geometry'
import type { TocEntry } from './ast'
import type { BoxGeometry } from './viewport-geometry'

/**
 * Rows the overlay occludes once `id` is pinned as the current heading: the
 * ancestor stack (self excluded, since a pinned heading sits visible below the
 * fold) plus the back badge when a history exists. This is the offset a jump
 * pins below, the resolver's "near top" offset, and the scrollbox tail reserve.
 */
export function foldOffset(params: {
  toc: TocEntry[]
  id: string
  fileLabel?: string
  historyDepth: number
}): number {
  const { toc, id, fileLabel, historyDepth } = params
  return (
    backBadgeRowsForDepth(historyDepth) +
    breadcrumbRows({
      chain: ancestorChain(toc, id),
      visibleHeadingIds: new Set([id]),
      hasH1: documentHasH1(toc),
      fileLabel,
    }).length
  )
}

/**
 * Rows the breadcrumb shows while `id` sits above the viewport (a search jump
 * pins the match line to the top, not the heading): the full chain including
 * `id`'s own crumb. No back badge.
 */
export function aboveOffset(params: { toc: TocEntry[]; id: string; fileLabel?: string }): number {
  const { toc, id, fileLabel } = params
  return breadcrumbRows({
    chain: ancestorChain(toc, id),
    visibleHeadingIds: new Set(),
    hasH1: documentHasH1(toc),
    fileLabel,
  }).length
}

/**
 * Resolve the current heading and the visible-heading set against live geometry.
 *
 * The breadcrumb overlay occludes the top rows, so "near top" and "visible" are
 * measured against the content below it (the fold offset). Heading and offset are
 * mutually recursive — the offset depends on which heading is current, which
 * depends on the offset — so iterate to a fixed point. A shallow heading sitting
 * at a deeper one's fold can cycle, so bail deterministically if an offset repeats.
 */
export function resolveHeadings(params: {
  geom: BoxGeometry
  toc: TocEntry[]
  headingIds: string[]
  fileLabel?: string
  historyDepth: number
}): { currentHeadingId: string | null; visibleHeadingIds: Set<string> } {
  const { geom, toc, headingIds, fileLabel, historyDepth } = params
  if (headingIds.length === 0) {
    return { currentHeadingId: null, visibleHeadingIds: new Set() }
  }
  let offset = 0
  let id: string | null = null
  const seen = new Set<number>()
  for (let pass = 0; pass < 8; pass++) {
    id = findHeadingNearTop(geom, headingIds, offset)
    const next = id ? foldOffset({ toc, id, fileLabel, historyDepth }) : 0
    if (next === offset || seen.has(next)) break
    seen.add(offset)
    offset = next
  }
  return {
    currentHeadingId: id,
    visibleHeadingIds: findVisibleHeadingIds(geom, headingIds, offset),
  }
}
