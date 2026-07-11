import type { Node, TocEntry } from './ast'
import type { Match } from './search'
import { breadcrumbHeightForHeading } from './toc-util'

/**
 * Where to scroll a search match: the heading to pin, plus the breadcrumb
 * overlay height to clear so the match lands below the sticky header rather than
 * behind it. Returns null when no heading precedes the match (top-of-document).
 */
export function matchScrollTarget(params: {
  nodes: Node[]
  toc: TocEntry[]
  match: Match
  fileLabel?: string
}): { headingId: string; topOffset: number } | null {
  const { nodes, toc, match, fileLabel } = params
  const headingId = nearestPrecedingHeadingId(nodes, match)
  if (!headingId) return null
  return { headingId, topOffset: breadcrumbHeightForHeading({ toc, id: headingId, fileLabel }) }
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
