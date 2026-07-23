import { createContext, useContext } from 'react'
import type { RefObject } from 'react'
import type { Match } from './lib/search'
import type { Focus } from './lib/keys'
import type { ResolvedMark } from './lib/scroll-marks'
import type { BoxGeometry } from './lib/viewport-geometry'

/**
 * Imperative scroll API surface exposed by the Viewer's scrollbox ref.
 *
 * `scrollBy`, `scrollTo` map directly to `ScrollBoxRenderable`.
 * `scrollToBottom` is a polyfill the Viewer provides by wrapping the raw
 * renderable ref:
 *   `{ scrollToBottom: () => box.scrollTo(box.scrollHeight) }`
 */
export type ScrollboxHandle = {
  scrollBy: (delta: number) => void
  scrollTo: (y: number) => void
  scrollToBottom: () => void
  /** Scrolls so the named child sits at the top of the viewport, offset `topOffset` rows down (default 0). */
  scrollChildToTop: (childId: string, topOffset?: number) => void
  /**
   * Queues a heading pin executed on the next post-layout frame instead of now.
   * Use right after a doc swap, when the target box is committed but still reads
   * y=0 — an immediate scroll would strand the reader at the top.
   */
  pinHeadingPostLayout: (childId: string, topOffset?: number) => void
  /** The live geometry port over the scrollbox — for pure heading/offset resolution. */
  getGeometry: () => BoxGeometry
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
  /**
   * Resolves search matches to absolute content-y for the scrollbar overlay.
   * `activeIndex` (search.index) tags one match as `activeMatch`. Returns raw geometry
   * for `computeTrackCells`. Unresolvable marks are omitted (never throws).
   */
  getScrollMarks: (params: { matches: Match[]; activeIndex: number }) => {
    marks: ResolvedMark[]
    scrollTop: number
    scrollHeight: number
    viewportHeight: number
    realContentHeight: number
  }
  /**
   * Less-style jump to a search match: scrolls its line to a few context rows
   * below the breadcrumb overlay (`topOffset` rows). See `matchJumpDelta`.
   */
  jumpToMatch: (params: {
    match: Match
    matches: Match[]
    index: number
    topOffset?: number
  }) => void
  /**
   * Seed index for a freshly committed search: the nearest match in the search
   * direction relative to the viewport top (wrapping). See `seedMatchIndex`.
   */
  seedMatchIndex: (params: { matches: Match[]; dir: 'forward' | 'backward' }) => number
  /** Registers a callback fired after every vertical scroll change. Returns an unsubscribe. */
  subscribeScroll: (cb: () => void) => () => void
  /** Current vertical scroll offset (content-space top), for history snapshots. */
  getScrollTop: () => number
}

export type SearchState = {
  pattern: string
  matches: Match[]
  index: number
  dir: 'forward' | 'backward'
  /** False while the pattern is being typed; true once Enter commits. Only a committed search may scroll the viewer. */
  committed: boolean
}

export type Status =
  | { kind: 'idle' }
  | { kind: 'error'; text: string }
  | { kind: 'info'; text: string }

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

  tocVisible: boolean
  toggleTocVisible: () => void

  /** Width (in cols) of the Viewer's content area, after TOC, scrollbar and padding. Capped to CONTENT_MAX_WIDTH. */
  contentWidth: number

  /** Directory of the active document; base dir for resolving relative links. Undefined for stdin. */
  dir?: string
  /** Follow a link href from the current document (anchor scroll, doc load, or ignore). */
  followLink: (href: string) => void
  /** Pop the history stack and restore the previous document + scroll. No-op if empty. */
  goBack: () => void
  /** Number of entries on the back stack (drives the back affordance). */
  historyDepth: number
  /** Label of the document `goBack` would return to (top of the back stack); undefined when empty. */
  backLabel?: string

  /** Max content column width (configurable; defaults to CONTENT_MAX_WIDTH). */
  contentMaxWidth: number

  /** Bottom statusline state; idle shows the viewmd badge + filename. */
  status: Status
  setStatus: (s: Status) => void
}

export const AppStateContext = createContext<AppState | null>(null)

export function useAppState(): AppState {
  const s = useContext(AppStateContext)
  if (!s) throw new Error('useAppState must be called inside an AppStateContext.Provider')
  return s
}
