import type { Action } from './keys'
import type { AppState, ScrollboxHandle } from '../state'
import type { TocEntry } from './ast'
import { backBadgeRowsForDepth, breadcrumbHeightForHeading, flattenVisible } from './toc-util'

export function dispatch(
  action: Action,
  state: AppState,
  toc: TocEntry[],
  headingIds: string[],
  viewportHeight: number,
  onQuit: () => void,
  fileLabel?: string,
  onOpenEditor?: () => void,
): void {
  const scroll = (fn: (v: ScrollboxHandle) => void): void => {
    const v = state.viewerRef.current
    if (!v) return
    fn(v)
    resolveHeadings(state, toc, headingIds, fileLabel)
  }
  switch (action.kind) {
    case 'quit':
      onQuit()
      return
    case 'scrollLine':
      return scroll(v => v.scrollBy(action.delta))
    case 'scrollPage':
      return scroll(v => v.scrollBy(action.delta * Math.max(1, viewportHeight - 2)))
    case 'scrollHalf':
      return scroll(v =>
        v.scrollBy(action.delta * Math.max(1, Math.floor((viewportHeight - 2) / 2))),
      )
    case 'top':
      return scroll(v => v.scrollTo(0))
    case 'bottom':
      return scroll(v => v.scrollToBottom())
    case 'nextHeading':
      jumpHeading(state, toc, headingIds, 1, fileLabel)
      return
    case 'prevHeading':
      jumpHeading(state, toc, headingIds, -1, fileLabel)
      return
    case 'focusSidebar':
      if (toc.length === 0 || !state.tocVisible) return
      if (!state.tocCursorId) state.setTocCursorId(toc[0]!.id)
      state.setFocus('sidebar')
      return
    case 'focusViewer':
      state.setFocus('viewer')
      return
    case 'tocUp':
    case 'tocDown': {
      const visible = flattenVisible(toc, state.expanded)
      if (visible.length === 0) return
      const idx = Math.max(
        0,
        visible.findIndex(e => e.id === state.tocCursorId),
      )
      const ni =
        action.kind === 'tocDown' ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx - 1)
      const next = visible[ni]
      if (next) state.setTocCursorId(next.id)
      return
    }
    case 'tocToggle':
      if (state.tocCursorId) state.toggleExpanded(state.tocCursorId)
      return
    case 'tocSelect': {
      const id = state.tocCursorId
      if (!id) return
      jumpToHeadingId(state, toc, headingIds, id, fileLabel)
      return
    }
    case 'tocJump':
      jumpToHeadingId(state, toc, headingIds, action.id, fileLabel)
      return
    case 'tocToggleId':
      state.toggleExpanded(action.id)
      return
    case 'startSearch':
      state.setSearch({ pattern: '', matches: [], index: -1, dir: action.dir, committed: false })
      state.setFocus('search')
      return
    case 'nextMatch':
    case 'prevMatch': {
      if (!state.search || state.search.matches.length === 0) return
      const total = state.search.matches.length
      const delta = action.kind === 'nextMatch' ? 1 : -1
      const index = (((state.search.index + delta) % total) + total) % total
      state.setSearch({ ...state.search, index })
      return
    }
    case 'clearSearch':
      state.setSearch(null)
      if (state.focus === 'search') state.setFocus('viewer')
      return
    case 'toggleMouse':
      state.toggleMouse()
      return
    case 'openEditor':
      onOpenEditor?.()
      return
    case 'goBack':
      state.goBack()
      return
    case 'toggleTocVisible':
      if (state.tocVisible && state.focus === 'sidebar') state.setFocus('viewer')
      state.toggleTocVisible()
      return
    case 'noop':
      return
  }
}

function jumpHeading(
  state: AppState,
  toc: TocEntry[],
  headingIds: string[],
  dir: 1 | -1,
  fileLabel?: string,
): void {
  if (headingIds.length === 0) return
  // Seed current heading from scroll position so n/N walk relative to the
  // viewport when the user scrolled with j/k rather than via heading nav.
  const cur =
    state.currentHeadingId ?? state.viewerRef.current?.getHeadingNearTop(headingIds) ?? null
  const idx = cur ? headingIds.indexOf(cur) : -1
  let nextIdx: number
  if (dir === 1) nextIdx = idx < 0 ? 0 : Math.min(headingIds.length - 1, idx + 1)
  else if (idx < 0) nextIdx = headingIds.length - 1
  else nextIdx = Math.max(0, idx - 1)
  const next = headingIds[nextIdx]
  if (!next) return
  const height = breadcrumbHeightAfterJump(state, toc, next, fileLabel)
  state.viewerRef.current?.scrollChildToTop(next, height)
  state.setCurrentHeadingId(next)
  refreshVisible(state, headingIds, height)
}

function jumpToHeadingId(
  state: AppState,
  toc: TocEntry[],
  headingIds: string[],
  id: string,
  fileLabel?: string,
): void {
  const height = breadcrumbHeightAfterJump(state, toc, id, fileLabel)
  state.viewerRef.current?.scrollChildToTop(id, height)
  state.setCurrentHeadingId(id)
  refreshVisible(state, headingIds, height)
  state.setFocus('viewer')
}

export function syncHeadings(
  state: AppState,
  toc: TocEntry[],
  headingIds: string[],
  fileLabel?: string,
): void {
  resolveHeadings(state, toc, headingIds, fileLabel)
}

// The breadcrumb overlay occludes the top rows of the viewport, so "near top"
// and "visible" must be measured against the content below it. The fold offset is
// the current heading's *ancestor stack* height (`breadcrumbHeightAfterJump`,
// which excludes the heading itself) — the same offset a jump uses, so scrolling
// to a heading lands identically to navigating to it. Excluding the heading's own
// crumb is deliberate: including it makes the offset self-referential and lets two
// states (crumb shown / not shown) both be consistent at the boundary, which is
// the frame-to-frame blip. Resolve the remaining current↔offset dependency as a
// fixed point; a shallow heading sitting at a deeper one's fold can cycle, so bail
// deterministically if an offset repeats.
function resolveHeadings(
  state: AppState,
  toc: TocEntry[],
  headingIds: string[],
  fileLabel?: string,
): void {
  const v = state.viewerRef.current
  if (!v || headingIds.length === 0) return
  let offset = 0
  let id: string | null = null
  const seen = new Set<number>()
  for (let pass = 0; pass < 8; pass++) {
    id = v.getHeadingNearTop(headingIds, offset) ?? null
    const next = id ? breadcrumbHeightAfterJump(state, toc, id, fileLabel) : 0
    if (next === offset || seen.has(next)) break
    seen.add(offset)
    offset = next
  }
  const visible = v.getVisibleHeadingIds(headingIds, offset)
  if (id && id !== state.currentHeadingId) state.setCurrentHeadingId(id)
  if (!setsEqual(state.visibleHeadingIds, visible)) state.setVisibleHeadingIds(visible)
}

// Rows the breadcrumb will show once `id` is pinned as the current heading: `id`
// itself lands below the overlay (visible, so filtered out); its ancestors stack
// above, plus the back badge when a history exists. Used as the pin/visibility
// offset so a jump lands the target just below its crumbs rather than hidden
// behind them.
function breadcrumbHeightAfterJump(
  state: AppState,
  toc: TocEntry[],
  id: string,
  fileLabel?: string,
): number {
  return breadcrumbHeightForHeading({
    toc,
    id,
    fileLabel,
    backBadgeRows: backBadgeRowsForDepth(state.historyDepth),
  })
}

function refreshVisible(state: AppState, headingIds: string[], topOffset: number): void {
  const v = state.viewerRef.current
  if (!v || headingIds.length === 0) return
  const next = v.getVisibleHeadingIds(headingIds, topOffset)
  if (setsEqual(state.visibleHeadingIds, next)) return
  state.setVisibleHeadingIds(next)
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
