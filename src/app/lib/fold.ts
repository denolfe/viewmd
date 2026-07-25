import { ancestorChain, breadcrumbRows, documentHasH1, trailRowsForDepth } from './toc-util'
import type { TocEntry } from './ast'
import type { BoxGeometry } from './viewport-geometry'

/** Small gap (rows) so a pinned heading isn't flush behind the breadcrumb crumbs. */
export const PIN_TOP_OFFSET = 1

/**
 * Last heading whose box sits at/above the fold (`topOffset` rows below the
 * viewport top, plus PIN_TOP_OFFSET slack). Falls back to the first heading
 * below when none are above. `childToTopDelta` pins jumps with the same slack,
 * so a freshly pinned heading resolves as current instead of its predecessor.
 */
export function findHeadingNearTop(
  geom: BoxGeometry,
  ids: string[],
  topOffset: number,
): string | null {
  const viewportTop = geom.viewportTop + topOffset + PIN_TOP_OFFSET
  let bestId: string | null = null
  let bestY = -Infinity
  for (const id of ids) {
    const child = geom.findChild(id)
    if (!child) continue
    if (child.y <= viewportTop && child.y > bestY) {
      bestY = child.y
      bestId = id
    }
  }
  if (bestId) return bestId
  let firstBelowId: string | null = null
  let firstBelowY = Infinity
  for (const id of ids) {
    const child = geom.findChild(id)
    if (!child) continue
    if (child.y < firstBelowY) {
      firstBelowY = child.y
      firstBelowId = id
    }
  }
  return firstBelowId
}

/** Ids whose box vertically overlaps the viewport below `topOffset`. */
export function findVisibleHeadingIds(
  geom: BoxGeometry,
  ids: string[],
  topOffset: number,
): Set<string> {
  const top = geom.viewportTop + topOffset
  const bottom = geom.viewportTop + geom.viewportHeight
  const out = new Set<string>()
  for (const id of ids) {
    const child = geom.findChild(id)
    if (!child) continue
    const childTop = child.y
    const childBottom = child.y + child.height
    if (childBottom > top && childTop < bottom) out.add(id)
  }
  return out
}

/** Rows to scroll so `id` sits `topOffset` (+ PIN_TOP_OFFSET) below the viewport top. Null if unmounted. */
export function childToTopDelta(geom: BoxGeometry, id: string, topOffset: number): number | null {
  const child = geom.findChild(id)
  if (!child) return null
  return child.y - geom.viewportTop - PIN_TOP_OFFSET - topOffset
}

export type HeadingResolution = {
  currentHeadingId: string | null
  visibleHeadingIds: Set<string>
}

export type Fold = {
  /** Rows the overlay occludes once `id` is the current heading (ancestor crumbs + trail row; self excluded). */
  offsetFor(id: string, historyDepth: number): number
  /** Overlay rows while `id` sits above the viewport (search jump): full chain incl. self, no trail row. */
  aboveOffsetFor(id: string): number
  /** Fold offset to reserve in the scrollbox tail for the last heading (0 when none). */
  tailReserve(lastHeadingId: string | null, historyDepth: number): number
  /** Current heading + visible set against live geometry, resolving the heading↔offset fixed point. */
  resolveCurrent(geom: BoxGeometry, headingIds: string[], historyDepth: number): HeadingResolution
}

/**
 * Owns the fold offset convention: how far below the breadcrumb overlay content
 * sits, and which heading is current given that offset. Constructed once per
 * document; `historyDepth` and geometry are passed per call because they change
 * as the user navigates and scrolls.
 */
export function createFold(params: { toc: TocEntry[]; fileLabel?: string }): Fold {
  const { toc, fileLabel } = params
  const hasH1 = documentHasH1(toc)

  const offsetFor = (id: string, historyDepth: number): number =>
    trailRowsForDepth(historyDepth) +
    breadcrumbRows({
      chain: ancestorChain(toc, id),
      visibleHeadingIds: new Set([id]),
      hasH1,
      fileLabel,
    }).length

  const aboveOffsetFor = (id: string): number =>
    breadcrumbRows({
      chain: ancestorChain(toc, id),
      visibleHeadingIds: new Set(),
      hasH1,
      fileLabel,
    }).length

  const tailReserve = (lastHeadingId: string | null, historyDepth: number): number =>
    lastHeadingId ? offsetFor(lastHeadingId, historyDepth) : 0

  const resolveCurrent = (
    geom: BoxGeometry,
    headingIds: string[],
    historyDepth: number,
  ): HeadingResolution => {
    if (headingIds.length === 0) {
      return { currentHeadingId: null, visibleHeadingIds: new Set() }
    }
    // Heading and offset are mutually recursive (offset depends on which heading
    // is current, which depends on the offset), so iterate to a fixed point. A
    // shallow heading sitting at a deeper one's fold can cycle; bail if an offset repeats.
    let offset = 0
    let id: string | null = null
    const seen = new Set<number>()
    for (let pass = 0; pass < 8; pass++) {
      id = findHeadingNearTop(geom, headingIds, offset)
      const next = id ? offsetFor(id, historyDepth) : 0
      if (next === offset || seen.has(next)) break
      seen.add(offset)
      offset = next
    }
    return {
      currentHeadingId: id,
      visibleHeadingIds: findVisibleHeadingIds(geom, headingIds, offset),
    }
  }

  return { offsetFor, aboveOffsetFor, tailReserve, resolveCurrent }
}
