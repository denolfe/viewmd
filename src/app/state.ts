import { createContext, useContext } from 'react'
import type { RefObject } from 'react'
import type { Match } from './lib/search'
import type { Focus } from './lib/keys'

/**
 * Imperative scroll API surface exposed by the Viewer's scrollbox ref.
 *
 * `scrollBy`, `scrollTo`, `scrollChildIntoView` map directly to
 * `ScrollBoxRenderable`. `scrollToBottom` is a polyfill the Viewer
 * provides by wrapping the raw renderable ref:
 *   `{ scrollToBottom: () => box.scrollTo(box.scrollHeight) }`
 */
export type ScrollboxHandle = {
  scrollBy: (delta: number) => void
  scrollTo: (y: number) => void
  scrollToBottom: () => void
  scrollChildIntoView: (childId: string) => void
  /** Scrolls so the named child sits at the top of the viewport, offset `topOffset` rows down (default 0). */
  scrollChildToTop: (childId: string, topOffset?: number) => void
  /**
   * Returns the id from `headingIds` whose box sits at or just above the visible
   * content top, or null. `topOffset` shifts that top down past the breadcrumb overlay.
   */
  getHeadingNearTop: (headingIds: string[], topOffset?: number) => string | null
  /**
   * Returns the subset of `headingIds` whose box vertically intersects the visible
   * content region. `topOffset` excludes the rows occluded by the breadcrumb overlay.
   */
  getVisibleHeadingIds: (headingIds: string[], topOffset?: number) => Set<string>
}

export type SearchState = {
  pattern: string
  matches: Match[]
  index: number
  dir: 'forward' | 'backward'
}

export type AppState = {
  focus: Focus
  setFocus: (f: Focus) => void

  currentHeadingId: string | null
  setCurrentHeadingId: (id: string | null) => void

  visibleHeadingIds: Set<string>
  setVisibleHeadingIds: (s: Set<string>) => void

  // Imperative scroll: handler calls viewerRef.current?.scrollBy(...) etc.
  viewerRef: RefObject<ScrollboxHandle | null>

  expanded: Map<string, boolean>
  toggleExpanded: (id: string) => void

  tocCursorId: string | null
  setTocCursorId: (id: string | null) => void

  search: SearchState | null
  setSearch: (s: SearchState | null) => void

  mouseEnabled: boolean
  toggleMouse: () => void

  /** Width (in cols) of the Viewer's content area, after TOC, scrollbar and padding. Capped to CONTENT_MAX_WIDTH. */
  contentWidth: number
}

export const AppStateContext = createContext<AppState | null>(null)

export function useAppState(): AppState {
  const s = useContext(AppStateContext)
  if (!s) throw new Error('useAppState must be called inside an AppStateContext.Provider')
  return s
}
