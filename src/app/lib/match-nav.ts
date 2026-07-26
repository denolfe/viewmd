import type { Node } from './ast'
import type { Match } from './search'
import type { Fold } from './fold'

/**
 * Where to scroll a search match: the nearest preceding heading, plus the
 * sticky overlay height to clear so the match lands below the overlay
 * rather than behind it. The jump leaves that heading above the viewport, so
 * its own ancestor row counts too. Returns null when no heading precedes the match.
 */
export function matchScrollTarget(params: {
  nodes: Node[]
  match: Match
  fold: Fold
}): { headingId: string; topOffset: number } | null {
  const { nodes, match, fold } = params
  const headingId = nearestPrecedingHeadingId(nodes, match)
  if (!headingId) return null
  return { headingId, topOffset: fold.aboveOffsetFor(headingId) }
}

/** Context rows shown above a jumped-to match (like less's -j jump target). */
export const JUMP_CONTEXT_ROWS = 5

/**
 * Less-style jump: rows to scroll so the match line lands `JUMP_CONTEXT_ROWS`
 * below the sticky overlay (`topOffset` rows), leaving a little context
 * above. Every navigation repositions; there is no already-visible exception.
 */
export function matchJumpDelta(params: {
  matchY: number
  viewportTop: number
  topOffset: number
}): number {
  const { matchY, viewportTop, topOffset } = params
  return matchY - (viewportTop + topOffset + JUMP_CONTEXT_ROWS)
}

/**
 * Seed index for a freshly committed search, less-style: the first match at or
 * below the viewport top, wrapping to the first match. `matchYs` holds each
 * match's resolved screen line (null when unresolvable), in match order.
 */
export function seedMatchIndex(params: {
  matchYs: (number | null)[]
  viewportTop: number
}): number {
  const { matchYs, viewportTop } = params
  for (let i = 0; i < matchYs.length; i++) {
    const y = matchYs[i]
    if (y === null || y === undefined) continue
    if (y >= viewportTop) return i
  }
  return 0
}

/**
 * Returns the heading id whose block index precedes the match's top-level block.
 * Returns null if no heading precedes the match (e.g., document starts with a paragraph).
 */
export function nearestPrecedingHeadingId(nodes: Node[], match: Match): string | null {
  const top = match.blockPath[0]
  if (top === undefined) return null
  let lastHeading: string | null = null
  const limit = Math.min(nodes.length, top + 1)
  for (let i = 0; i < limit; i++) {
    const n = nodes[i]
    if (!n) continue
    if (n.kind === 'heading') lastHeading = n.id
  }
  return lastHeading
}
