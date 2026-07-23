import { ancestorChain, backBadgeRowsForDepth, breadcrumbRows, documentHasH1 } from './toc-util'
import type { TocEntry } from './ast'

/**
 * Rows the overlay occludes once `id` is pinned as the current heading: the
 * ancestor stack (self excluded, since a pinned heading sits visible below the
 * fold) plus the back badge when a history exists. The offset a jump pins below,
 * the resolver's "near top" offset, and the scrollbox tail reserve.
 */
export function foldOffset(params: {
  toc: TocEntry[]
  id: string
  fileLabel?: string
  historyDepth: number
}): number {
  const { toc, id, fileLabel, historyDepth } = params
  return (
    backBadgeRowsForDepth(historyDepth) +
    breadcrumbRows({
      chain: ancestorChain(toc, id),
      visibleHeadingIds: new Set([id]),
      hasH1: documentHasH1(toc),
      fileLabel,
    }).length
  )
}

/**
 * Rows the breadcrumb shows while `id` sits above the viewport (a search jump
 * pins the match line to the top, not the heading): the full chain including
 * `id`'s own crumb. No back badge.
 */
export function aboveOffset(params: { toc: TocEntry[]; id: string; fileLabel?: string }): number {
  const { toc, id, fileLabel } = params
  return breadcrumbRows({
    chain: ancestorChain(toc, id),
    visibleHeadingIds: new Set(),
    hasH1: documentHasH1(toc),
    fileLabel,
  }).length
}
