import type { Action } from './keys'
import type { AppState, ScrollboxHandle } from '../state'
import type { TocEntry } from './ast'
import { flattenVisible } from './toc-util'
import { foldOffset, resolveHeadings } from './heading-resolution'
import { findHeadingNearTop, findVisibleHeadingIds } from './viewport-geometry'

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
    syncHeadings(state, toc, headingIds, fileLabel)
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
  const geom = state.viewerRef.current?.getGeometry()
  const cur = state.currentHeadingId ?? (geom ? findHeadingNearTop(geom, headingIds, 0) : null)
  const idx = cur ? headingIds.indexOf(cur) : -1
  let nextIdx: number
  if (dir === 1) nextIdx = idx < 0 ? 0 : Math.min(headingIds.length - 1, idx + 1)
  else if (idx < 0) nextIdx = headingIds.length - 1
  else nextIdx = Math.max(0, idx - 1)
  const next = headingIds[nextIdx]
  if (!next) return
  const height = foldOffset({ toc, id: next, fileLabel, historyDepth: state.historyDepth })
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
  const height = foldOffset({ toc, id, fileLabel, historyDepth: state.historyDepth })
  state.viewerRef.current?.scrollChildToTop(id, height)
  state.setCurrentHeadingId(id)
  refreshVisible(state, headingIds, height)
  state.setFocus('viewer')
}

// Resolve current + visible headings against live geometry and apply the setters
// only on change. The breadcrumb overlay occludes the top rows, so resolution
// measures against the content below the fold (see resolveHeadings).
export function syncHeadings(
  state: AppState,
  toc: TocEntry[],
  headingIds: string[],
  fileLabel?: string,
): void {
  const v = state.viewerRef.current
  if (!v || headingIds.length === 0) return
  const { currentHeadingId, visibleHeadingIds } = resolveHeadings({
    geom: v.getGeometry(),
    toc,
    headingIds,
    fileLabel,
    historyDepth: state.historyDepth,
  })
  if (currentHeadingId && currentHeadingId !== state.currentHeadingId) {
    state.setCurrentHeadingId(currentHeadingId)
  }
  if (!setsEqual(state.visibleHeadingIds, visibleHeadingIds)) {
    state.setVisibleHeadingIds(visibleHeadingIds)
  }
}

function refreshVisible(state: AppState, headingIds: string[], topOffset: number): void {
  const geom = state.viewerRef.current?.getGeometry()
  if (!geom || headingIds.length === 0) return
  const next = findVisibleHeadingIds(geom, headingIds, topOffset)
  if (setsEqual(state.visibleHeadingIds, next)) return
  state.setVisibleHeadingIds(next)
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
