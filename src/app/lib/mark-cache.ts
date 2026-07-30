import type { Match } from './search'
import type { ResolvedMark } from './scroll-marks'

export type MarkCache = {
  /**
   * Resolved marks for `matches` at reflow `token`. Resolves only on a miss, so the
   * scroll path can read marks every row without paying a tree walk.
   */
  read(params: { matches: Match[]; token: number }): ResolvedMark[]
}

/**
 * Owns when scroll marks must be resolved again. `matches` is compared by identity:
 * search state hands out a new array per pattern, so identity is the grain that
 * matters. `token` is an opaque reflow counter, because marks are document-space and
 * only a reflow can move one.
 */
export function createMarkCache(resolve: (matches: Match[]) => ResolvedMark[]): MarkCache {
  let cached: { matches: Match[]; token: number; marks: ResolvedMark[] } | null = null
  return {
    read: ({ matches, token }) => {
      if (cached && cached.matches === matches && cached.token === token) return cached.marks
      const marks = resolve(matches)
      cached = { matches, token, marks }
      return marks
    },
  }
}
