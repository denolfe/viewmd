import type { Match } from './search'
import type { ResolvedMark } from './scroll-marks'

export type MarkCache = {
  /**
   * Resolved marks for `matches`, re-resolved only when the reflow key changes, so
   * the scroll path can read marks every row without paying a tree walk. The result
   * is the cached array instance, so callers must treat it as read-only.
   */
  read(matches: Match[]): ResolvedMark[]
}

/**
 * Owns when scroll marks must be resolved again. `reflowKey` must describe the
 * *laid-out* state, not the pending render: a resolve reads geometry, so a key that
 * ran ahead of layout would cache marks under a value that never comes back around.
 * It is probed per read. `matches` is compared by identity, because search state
 * mints a new array per pattern.
 */
export function createMarkCache(params: {
  resolve: (matches: Match[]) => ResolvedMark[]
  reflowKey: () => string
}): MarkCache {
  const { resolve, reflowKey } = params
  let cached: { matches: Match[]; key: string; marks: ResolvedMark[] } | null = null
  return {
    read: matches => {
      const key = reflowKey()
      if (cached && cached.matches === matches && cached.key === key) return cached.marks
      const marks = resolve(matches)
      cached = { matches, key, marks }
      return marks
    },
  }
}
