import { ancestorChain, ancestorRows, documentHasH1, trailRowsForDepth } from './overlay-rows'
import type { TocEntry } from './ast'
import type { BoxGeometry, ChildGeometry } from './viewport-geometry'

/** Small gap (rows) so a pinned heading isn't flush behind its ancestor rows. */
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
  return resolveHeadingNearTop({
    boxes: geom.findChildren(ids),
    ids,
    top: geom.viewportTop + topOffset,
  })
}

/** Ids whose box vertically overlaps the viewport below `topOffset`. */
export function findVisibleHeadingIds(
  geom: BoxGeometry,
  ids: string[],
  topOffset: number,
): Set<string> {
  return resolveVisibleIds({
    boxes: geom.findChildren(ids),
    ids,
    top: geom.viewportTop + topOffset,
    bottom: geom.viewportTop + geom.viewportHeight,
  })
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
  /** Rows the overlay occludes once `id` is the current heading (ancestor rows + trail row; self excluded). */
  offsetFor(id: string, historyDepth: number): number
  /** Overlay rows while `id` sits above the viewport (search jump): full chain incl. self, no trail row. */
  aboveOffsetFor(id: string): number
  /** Fold offset to reserve in the scrollbox tail for the last heading (0 when none). */
  tailReserve(lastHeadingId: string | null, historyDepth: number): number
  /** Current heading + visible set against live geometry, resolving the heading↔offset fixed point. */
  resolveCurrent(geom: BoxGeometry, headingIds: string[], historyDepth: number): HeadingResolution
}

/**
 * Owns the fold offset convention: how far below the sticky overlay content
 * sits, and which heading is current given that offset. Constructed once per
 * document; `historyDepth` and geometry are passed per call because they change
 * as the user navigates and scrolls.
 */
export function createFold(params: { toc: TocEntry[]; fileLabel?: string }): Fold {
  const { toc, fileLabel } = params
  const hasH1 = documentHasH1(toc)

  const offsetFor = (id: string, historyDepth: number): number =>
    trailRowsForDepth(historyDepth) +
    ancestorRows({
      chain: ancestorChain(toc, id),
      visibleHeadingIds: new Set([id]),
      hasH1,
      fileLabel,
    }).length

  const aboveOffsetFor = (id: string): number =>
    ancestorRows({
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
    // Geometry is fixed for this call, so resolve the boxes every pass shares once.
    const boxes = geom.findChildren(headingIds)
    // Heading and offset are mutually recursive (offset depends on which heading
    // is current, which depends on the offset), so iterate to a fixed point. A
    // shallow heading sitting at a deeper one's fold can cycle; bail if an offset repeats.
    let offset = 0
    let id: string | null = null
    const seen = new Set<number>()
    for (let pass = 0; pass < 8; pass++) {
      id = resolveHeadingNearTop({ boxes, ids: headingIds, top: geom.viewportTop + offset })
      const next = id ? offsetFor(id, historyDepth) : 0
      if (next === offset || seen.has(next)) break
      seen.add(offset)
      offset = next
    }
    return {
      currentHeadingId: id,
      visibleHeadingIds: resolveVisibleIds({
        boxes,
        ids: headingIds,
        top: geom.viewportTop + offset,
        bottom: geom.viewportTop + geom.viewportHeight,
      }),
    }
  }

  return { offsetFor, aboveOffsetFor, tailReserve, resolveCurrent }
}

/** Last heading at/above `top` (plus PIN_TOP_OFFSET slack), else the topmost one. */
function resolveHeadingNearTop(params: {
  boxes: Map<string, ChildGeometry>
  ids: string[]
  top: number
}): string | null {
  const { boxes, ids } = params
  const fold = params.top + PIN_TOP_OFFSET
  let bestId: string | null = null
  let bestY = -Infinity
  let firstBelowId: string | null = null
  let firstBelowY = Infinity
  for (const id of ids) {
    const box = boxes.get(id)
    if (!box) continue
    if (box.y <= fold && box.y > bestY) {
      bestY = box.y
      bestId = id
    }
    if (box.y < firstBelowY) {
      firstBelowY = box.y
      firstBelowId = id
    }
  }
  return bestId ?? firstBelowId
}

/** Ids whose box overlaps the `top`..`bottom` band. */
function resolveVisibleIds(params: {
  boxes: Map<string, ChildGeometry>
  ids: string[]
  top: number
  bottom: number
}): Set<string> {
  const { boxes, ids, top, bottom } = params
  const out = new Set<string>()
  for (const id of ids) {
    const box = boxes.get(id)
    if (!box) continue
    if (box.y + box.height > top && box.y < bottom) out.add(id)
  }
  return out
}
