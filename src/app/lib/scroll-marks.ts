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
 * independent of scroll position, so this recomputes only on reflow. `contentHeight`
 * is the real content height (scrollHeight minus the synthetic tail); `trackHeight`
 * is the viewport height in rows. When several marks share a row, the highest-rank
 * kind wins.
 */
export function computeTrackCells(params: {
  marks: ResolvedMark[]
  contentHeight: number
  trackHeight: number
}): TrackCell[] {
  const { marks, contentHeight, trackHeight } = params
  if (trackHeight < 1 || contentHeight <= trackHeight) return []
  const span = trackHeight - 1
  const byRow = new Map<number, MarkKind>()
  for (const mark of marks) {
    const raw = Math.round((mark.y / contentHeight) * span)
    const row = Math.max(0, Math.min(span, raw))
    const existing = byRow.get(row)
    if (!existing || KIND_RANK[mark.kind] > KIND_RANK[existing]) byRow.set(row, mark.kind)
  }
  return [...byRow.entries()].map(([row, kind]) => ({ row, kind }))
}
