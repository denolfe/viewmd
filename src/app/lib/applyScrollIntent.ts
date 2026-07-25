import type { Commands } from './commands'
import type { ScrollIntent } from './documentNavigation'

/**
 * Route a positioning request to the matching command, mirroring the keyboard `dispatch`.
 * The `headingIds` guard keeps anchors honest: a same-doc jump to an unknown slug (broken
 * `#fragment`) is a no-op — scrolling would find no box and blanking the current heading
 * breaks n/N nav — while a post-swap anchor that no longer exists falls back to the top.
 */
export function applyScrollIntent(params: {
  scroll: ScrollIntent
  commands: Commands
  headingIds: string[]
}): void {
  const { scroll, commands, headingIds } = params
  if (scroll.kind === 'restore') {
    return commands.restoreScroll({
      scrollTop: scroll.scrollTop,
      currentHeadingId: scroll.currentHeadingId,
    })
  }
  if (scroll.kind === 'anchor' && !scroll.postSwap) {
    if (headingIds.includes(scroll.headingId)) commands.jumpToHeading(scroll.headingId)
    return
  }
  if (scroll.kind === 'anchor' && headingIds.includes(scroll.headingId)) {
    return commands.pinHeadingPostSwap(scroll.headingId)
  }
  return commands.resetToTop()
}
