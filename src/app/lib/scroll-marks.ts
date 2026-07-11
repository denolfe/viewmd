/** Mark categories, ordered by paint priority (higher wins a shared row). */
export type MarkKind = 'match' | 'activeMatch'

/** A mark resolved to its document-space y (row offset from the top of the scroll content). */
export type ResolvedMark = { y: number; kind: MarkKind }

/** One painted scrollbar cell. */
export type TrackCell = { row: number; kind: MarkKind }

/** Inclusive track-row span of the scrollbar thumb. */
export type ThumbRows = { start: number; end: number }

const KIND_RANK: Record<MarkKind, number> = { match: 1, activeMatch: 2 }

/** Stable DOM id for a block box, keyed by its index path through the AST. */
export function blockId(path: number[]): string {
  return `blk-${path.join('-')}`
}

/**
 * Maps document-space marks to scrollbar track rows. Marks map document → track
 * independent of scroll position, so this recomputes only on reflow.
 *
 * Position uses `scrollHeight` (total content incl. the synthetic tail), NOT the
 * real content height — this is the exact scale OpenTUI positions the thumb with
 * (`thumbTop = scrollPosition / scrollHeight * trackHeight`). Matching it means a
 * mark at document-`y` lands where the thumb sits once that `y` is scrolled to the
 * top, so navigating to a match puts the mark inside the thumb.
 *
 * `realContentHeight` (scrollHeight minus tail) is used only for the scrollability
 * guard: when the whole document fits the viewport there is nothing to indicate.
 * When several marks share a row, the highest-rank kind wins.
 */
export function computeTrackCells(params: {
  marks: ResolvedMark[]
  scrollHeight: number
  viewportHeight: number
  realContentHeight: number
}): TrackCell[] {
  const { marks, scrollHeight, viewportHeight, realContentHeight } = params
  if (viewportHeight < 1 || scrollHeight <= 0 || realContentHeight <= viewportHeight) return []
  const byRow = new Map<number, MarkKind>()
  for (const mark of marks) {
    const raw = Math.round((mark.y / scrollHeight) * viewportHeight)
    const row = Math.max(0, Math.min(viewportHeight - 1, raw))
    const existing = byRow.get(row)
    if (!existing || KIND_RANK[mark.kind] > KIND_RANK[existing]) byRow.set(row, mark.kind)
  }
  return [...byRow.entries()].map(([row, kind]) => ({ row, kind }))
}

/**
 * Replicates OpenTUI's vertical slider thumb placement (half-cell "virtual"
 * track, `getVirtualThumbSize`/`getVirtualThumbStart`) plus our
 * `installRealisticThumb` viewPortSize override, so the overlay can tell which
 * track rows the thumb occupies. Returns null when the content isn't scrollable.
 */
export function computeThumbRows(params: {
  scrollTop: number
  scrollHeight: number
  viewportHeight: number
  realContentHeight: number
}): ThumbRows | null {
  const { scrollTop, scrollHeight, viewportHeight, realContentHeight } = params
  const range = scrollHeight - viewportHeight
  if (viewportHeight < 1 || scrollHeight <= 0 || range <= 0) return null
  // installRealisticThumb sizes the thumb to viewport/realContent (skipped when
  // the real content fits the viewport); the slider clamps viewPortSize to range.
  const desired =
    realContentHeight > viewportHeight
      ? Math.max(1, Math.round((viewportHeight * scrollHeight) / realContentHeight))
      : viewportHeight
  const viewPortSize = Math.max(0.01, Math.min(desired, range))
  const virtualTrack = viewportHeight * 2
  const virtualThumbSize = Math.max(
    1,
    Math.min(Math.floor((virtualTrack * viewPortSize) / (range + viewPortSize)), virtualTrack),
  )
  const clampedTop = Math.max(0, Math.min(scrollTop, range))
  const virtualStart = Math.round((clampedTop / range) * (virtualTrack - virtualThumbSize))
  const start = Math.max(0, Math.floor(virtualStart / 2))
  const end = Math.min(viewportHeight - 1, Math.ceil((virtualStart + virtualThumbSize) / 2) - 1)
  return { start, end }
}
