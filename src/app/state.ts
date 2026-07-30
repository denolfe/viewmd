import { createContext, useContext } from 'react'
import type { RefObject } from 'react'
import type { Match } from './lib/search'
import type { Focus } from './lib/keys'
import type { ResolvedMark } from './lib/scroll-marks'
import type { Commands } from './lib/commands'
import type { BoxGeometry } from './lib/viewport-geometry'

/**
 * Imperative scroll API surface, built by `createScrollboxHandle`
 * (`src/app/lib/scrollbox-handle.ts`) over the mounted scrollbox.
 *
 * `scrollBy`, `scrollTo` map directly to `ScrollBoxRenderable`.
 * `scrollToBottom` is a polyfill over the raw renderable:
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
  /**
   * Queues a scroll to absolute content-y `top`, retried each post-layout frame
   * until reached (progressive mount may not have grown `scrollHeight` yet).
   * Marks the retry a "swap" reposition, so its resolution fires `onRepositioned`.
   */
  pinScrollTop: (top: number) => void
  /** The live geometry port over the scrollbox — for pure heading/offset resolution. */
  getGeometry: () => BoxGeometry
  /**
   * Search matches resolved to document-space marks for the scrollbar overlay, plus
   * the scroll/track dimensions that position them. Unresolvable marks are omitted
   * and never throw; `computeTrackCells` tags the active match itself. `marks` is a
   * cached instance shared across calls — callers must treat it as read-only.
   */
  getScrollMarks: (params: { matches: Match[] }) => {
    marks: ResolvedMark[]
    scrollTop: number
    scrollHeight: number
    viewportHeight: number
    realContentHeight: number
  }
  /**
   * Less-style jump to a search match: scrolls its line to a few context rows
   * below the sticky overlay (`topOffset` rows). See `matchJumpDelta`.
   */
  jumpToMatch: (params: {
    match: Match
    matches: Match[]
    index: number
    topOffset?: number
  }) => void
  /**
   * Seed index for a freshly committed search: the first match at or below the
   * viewport top, wrapping to the first. See `seedMatchIndex`.
   */
  seedMatchIndex: (params: { matches: Match[] }) => number
  /** Registers a callback fired after every vertical scroll change. Returns an unsubscribe. */
  subscribeScroll: (cb: () => void) => () => void
  /** Current vertical scroll offset (content-space top), for history snapshots. */
  getScrollTop: () => number
}

export type SearchState = {
  pattern: string
  matches: Match[]
  index: number
  /** False while the pattern is being typed; true once Enter commits. Only a committed search may scroll the viewer. */
  committed: boolean
}

export type Status =
  | { kind: 'idle' }
  | { kind: 'error'; text: string }
  | { kind: 'info'; text: string }

/**
 * Heading state, which changes on nearly every scrolled row. Held apart from
 * `AppState` because only the overlay and the sidebar read it: folding it in
 * would invalidate that context every row and re-render the whole content tree
 * to repaint three renderables.
 */
export type HeadingState = {
  /** Last heading at/above the Fold, or the last one jumped to. */
  currentHeadingId: string | null
  /** Heading ids whose box intersects the Viewport below the Fold offset. */
  visibleHeadingIds: Set<string>
}

export const HeadingStateContext = createContext<HeadingState | null>(null)

export function useHeadingState(): HeadingState {
  const s = useContext(HeadingStateContext)
  if (!s) throw new Error('useHeadingState must be called inside a HeadingStateContext.Provider')
  return s
}

export type AppState = {
  focus: Focus

  // Imperative scroll: handler calls viewerRef.current?.scrollBy(...) etc.
  viewerRef: RefObject<ScrollboxHandle | null>

  expanded: Map<string, boolean>

  tocCursorId: string | null

  search: SearchState | null

  /** Width (in cols) of the Viewer's content area, after TOC, scrollbar and padding. Capped to CONTENT_MAX_WIDTH. */
  contentWidth: number

  /** Directory of the active document; base dir for resolving relative links. Undefined for stdin. */
  dir?: string
  /** Number of entries on the back stack (drives the back affordance). */
  historyDepth: number
  /** Full navigation label chain, origin first and current doc last; drives the Trail. */
  trailLabels: (string | undefined)[]

  /** Max content column width (configurable; defaults to CONTENT_MAX_WIDTH). */
  contentMaxWidth: number

  /** Bottom statusline state; idle shows the viewmd badge + filename. */
  status: Status

  /** Whether the keyboard-shortcuts help panel is open. */
  helpVisible: boolean

  commands: Commands
}

export const AppStateContext = createContext<AppState | null>(null)

export function useAppState(): AppState {
  const s = useContext(AppStateContext)
  if (!s) throw new Error('useAppState must be called inside an AppStateContext.Provider')
  return s
}
