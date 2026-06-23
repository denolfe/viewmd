import type { Node } from './ast'
import type { Match } from './search'

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
