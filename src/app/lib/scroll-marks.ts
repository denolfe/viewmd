/** Mark categories, ordered by paint priority (higher wins a shared row). */
export type MarkKind = 'match' | 'activeMatch'

/** A mark resolved to its absolute content-space y (same frame as renderable `.y`). */
export type ResolvedMark = { y: number; kind: MarkKind }

/** One painted scrollbar cell. */
export type TrackCell = { row: number; kind: MarkKind }

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
