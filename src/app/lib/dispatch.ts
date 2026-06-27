import type { Action } from './keys'
import type { AppState } from '../state'
import type { TocEntry } from './ast'
import { flattenVisible } from './toc-util'

export function dispatch(
  action: Action,
  state: AppState,
  toc: TocEntry[],
  headingIds: string[],
  viewportHeight: number,
  onQuit: () => void,
): void {
  const v = state.viewerRef.current
  switch (action.kind) {
    case 'quit':
      onQuit()
      return
    case 'scrollLine':
      v?.scrollBy(action.delta)
      syncCurrentHeading(state, headingIds)
      return
    case 'scrollPage':
      v?.scrollBy(action.delta * Math.max(1, viewportHeight - 2))
      syncCurrentHeading(state, headingIds)
      return
    case 'scrollHalf':
      v?.scrollBy(action.delta * Math.max(1, Math.floor((viewportHeight - 2) / 2)))
      syncCurrentHeading(state, headingIds)
      return
    case 'top':
      v?.scrollTo(0)
      syncCurrentHeading(state, headingIds)
      return
    case 'bottom':
      v?.scrollToBottom()
      syncCurrentHeading(state, headingIds)
      return
    case 'nextHeading':
      jumpHeading(state, headingIds, 1)
      return
    case 'prevHeading':
      jumpHeading(state, headingIds, -1)
      return
    case 'focusSidebar':
      if (toc.length === 0) return
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
      v?.scrollChildToTop(id)
      state.setCurrentHeadingId(id)
      state.setFocus('viewer')
      return
    }
    case 'startSearch':
      state.setSearch({ pattern: '', matches: [], index: -1, dir: action.dir })
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
    case 'noop':
      return
  }
}

function jumpHeading(state: AppState, headingIds: string[], dir: 1 | -1): void {
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
  state.viewerRef.current?.scrollChildToTop(next)
  state.setCurrentHeadingId(next)
  refreshVisible(state, headingIds)
}

function syncCurrentHeading(state: AppState, headingIds: string[]): void {
  if (headingIds.length === 0) return
  const v = state.viewerRef.current
  if (!v) return
  const id = v.getHeadingNearTop(headingIds) ?? null
  if (id && id !== state.currentHeadingId) state.setCurrentHeadingId(id)
  refreshVisible(state, headingIds)
}

function refreshVisible(state: AppState, headingIds: string[]): void {
  const v = state.viewerRef.current
  if (!v || headingIds.length === 0) return
  const next = v.getVisibleHeadingIds(headingIds)
  if (setsEqual(state.visibleHeadingIds, next)) return
  state.setVisibleHeadingIds(next)
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
