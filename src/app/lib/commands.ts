import type { RefObject } from 'react'
import type { ScrollboxHandle } from '../state'
import type { Node, TocEntry } from './ast'
import type { DocReset } from './documentNavigation'
import { flattenVisible } from './toc-util'
import { findMatches } from './search'
import type { Fold } from './fold'
import type { ViewActions, ViewState } from './view-state'

export type CommandDeps = {
  viewerRef: RefObject<ScrollboxHandle | null>
  doc: { nodes: Node[]; toc: TocEntry[]; headingIds: string[]; fileLabel?: string }
  fold: Fold
  viewportHeight: number
  stateRef: RefObject<ViewState>
  actions: ViewActions
  historyDepth: number
  onQuit: () => void
  onOpenEditor: () => void
  nav: { follow: (href: string) => void; back: () => void; backTo: (index: number) => void }
}

export type Commands = {
  scrollBy(delta: number): void
  scrollPage(dir: number): void
  scrollHalf(dir: number): void
  scrollToTop(): void
  scrollToBottom(): void
  syncFromScroll(): void
  jumpHeadingBy(dir: 1 | -1): void
  jumpToHeading(id: string): void
  jumpToCursor(): void
  focusSidebar(): void
  focusViewer(): void
  tocMove(dir: 1 | -1): void
  toggleCursorExpanded(): void
  toggleExpanded(id: string): void
  toggleTocVisible(): void
  toggleHelp(): void
  startSearch(): void
  applySearchPattern(p: { pattern: string; commit: boolean }): void
  stepMatch(dir: 1 | -1): void
  clearSearch(): void
  followLink(href: string): void
  goBack(): void
  /** Navigate to a specific document in the history chain by its trail index, discarding docs visited after it. */
  goToDocument(index: number): void
  openEditor(): void
  toggleMouse(): void
  quit(): void
  resetForNewDoc(reset: DocReset): void
  pinHeadingPostSwap(id: string): void
  restoreScroll(p: { scrollTop: number; currentHeadingId: string | null }): void
  resetToTop(): void
}

export function createCommands(deps: CommandDeps): Commands {
  const {
    viewerRef,
    doc,
    fold,
    viewportHeight,
    stateRef,
    actions,
    historyDepth,
    onQuit,
    onOpenEditor,
    nav,
  } = deps

  // Rows the overlay will show once `id` is pinned as the current heading: `id`
  // itself lands below the overlay (visible, so filtered out); its ancestors stack
  // above, plus the back badge when a history exists. Used as the pin/visibility
  // offset so a jump lands the target just below its ancestor rows rather than hidden
  // behind them. See `Fold.offsetFor` for the offset-convention rationale.
  const offsetFor = (id: string): number => fold.offsetFor(id, historyDepth)

  const refreshVisible = (topOffset: number): void => {
    const v = viewerRef.current
    if (!v || doc.headingIds.length === 0) return
    // Visible set only: `jumpTo` sets currentHeadingId to the jump target, and
    // writing it from geometry here would override that on the frame before the
    // pin lands.
    const { visibleHeadingIds } = fold.resolveAt({
      geom: v.getGeometry(),
      headingIds: doc.headingIds,
      topOffset,
    })
    if (!setsEqual(stateRef.current.visibleHeadingIds, visibleHeadingIds)) {
      actions.visibleHeadingIds(visibleHeadingIds)
    }
  }

  // Resolve current + visible headings against live geometry and apply the setters
  // only on change. The sticky overlay occludes the top rows, so resolution
  // measures against the content below the fold (see `Fold.resolveCurrent`).
  const resolveHeadings = (): void => {
    const v = viewerRef.current
    if (!v || doc.headingIds.length === 0) return
    const { currentHeadingId, visibleHeadingIds } = fold.resolveCurrent({
      geom: v.getGeometry(),
      headingIds: doc.headingIds,
      historyDepth,
    })
    if (currentHeadingId && currentHeadingId !== stateRef.current.currentHeadingId) {
      actions.currentHeadingId(currentHeadingId)
    }
    if (!setsEqual(stateRef.current.visibleHeadingIds, visibleHeadingIds)) {
      actions.visibleHeadingIds(visibleHeadingIds)
    }
  }

  const jumpTo = (id: string): void => {
    const height = offsetFor(id)
    viewerRef.current?.scrollChildToTop(id, height)
    actions.currentHeadingId(id)
    refreshVisible(height)
  }

  const scroll = (fn: (v: ScrollboxHandle) => void): void => {
    const v = viewerRef.current
    if (!v) return
    fn(v)
    resolveHeadings()
  }

  return {
    scrollBy: d => scroll(v => v.scrollBy(d)),
    scrollPage: dir => scroll(v => v.scrollBy(dir * Math.max(1, viewportHeight - 2))),
    scrollHalf: dir =>
      scroll(v => v.scrollBy(dir * Math.max(1, Math.floor((viewportHeight - 2) / 2)))),
    scrollToTop: () => scroll(v => v.scrollTo(0)),
    scrollToBottom: () => scroll(v => v.scrollToBottom()),
    syncFromScroll: resolveHeadings,

    jumpHeadingBy: dir => {
      if (doc.headingIds.length === 0) return
      // Seed current heading from scroll position so n/N walk relative to the
      // viewport when the user scrolled with j/k rather than via heading nav.
      const geom = viewerRef.current?.getGeometry()
      const cur =
        stateRef.current.currentHeadingId ??
        (geom
          ? fold.resolveAt({ geom, headingIds: doc.headingIds, topOffset: 0 }).currentHeadingId
          : null)
      const idx = cur ? doc.headingIds.indexOf(cur) : -1
      let nextIdx: number
      if (dir === 1) nextIdx = idx < 0 ? 0 : Math.min(doc.headingIds.length - 1, idx + 1)
      else if (idx < 0) nextIdx = doc.headingIds.length - 1
      else nextIdx = Math.max(0, idx - 1)
      const next = doc.headingIds[nextIdx]
      if (next) jumpTo(next)
    },
    jumpToHeading: id => {
      jumpTo(id)
      actions.focus('viewer')
    },
    jumpToCursor: () => {
      const id = stateRef.current.tocCursorId
      if (id) {
        jumpTo(id)
        actions.focus('viewer')
      }
    },

    focusSidebar: () => {
      if (doc.toc.length === 0 || !stateRef.current.tocVisible) return
      const first = doc.toc[0]
      if (!stateRef.current.tocCursorId && first) actions.tocCursorId(first.id)
      actions.focus('sidebar')
    },
    focusViewer: () => actions.focus('viewer'),
    tocMove: dir => {
      const visible = flattenVisible(doc.toc, stateRef.current.expanded)
      if (visible.length === 0) return
      const idx = Math.max(
        0,
        visible.findIndex(e => e.id === stateRef.current.tocCursorId),
      )
      const ni = dir === 1 ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx - 1)
      const next = visible[ni]
      if (next) actions.tocCursorId(next.id)
    },
    toggleCursorExpanded: () => {
      if (stateRef.current.tocCursorId)
        actions.toggleExpanded({ toc: doc.toc, id: stateRef.current.tocCursorId })
    },
    toggleExpanded: id => actions.toggleExpanded({ toc: doc.toc, id }),
    toggleTocVisible: () => {
      if (stateRef.current.tocVisible && stateRef.current.focus === 'sidebar')
        actions.focus('viewer')
      actions.toggleTocVisible()
    },
    toggleHelp: () => actions.toggleHelp(),

    startSearch: () => {
      actions.search({ pattern: '', matches: [], index: -1, committed: false })
      actions.focus('search')
    },
    // Recompute matches from the passed `pattern`, not the committed search state: the
    // input's Enter can arrive before React re-renders, so committing a stale
    // snapshot would search a truncated/empty string.
    applySearchPattern: ({ pattern, commit }) => {
      const s = stateRef.current.search
      if (!s) return
      const matches = findMatches(doc.nodes, pattern)
      const index = matches.length ? (viewerRef.current?.seedMatchIndex({ matches }) ?? 0) : -1
      actions.search({ ...s, pattern, matches, index, committed: commit })
      if (commit) actions.focus('viewer')
    },
    stepMatch: dir => {
      const s = stateRef.current.search
      if (!s || s.matches.length === 0) return
      const total = s.matches.length
      const index = (((s.index + dir) % total) + total) % total
      actions.search({ ...s, index })
    },
    clearSearch: () => {
      actions.search(null)
      if (stateRef.current.focus === 'search') actions.focus('viewer')
    },

    followLink: href => nav.follow(href),
    goBack: () => nav.back(),
    goToDocument: index => nav.backTo(index),
    openEditor: () => onOpenEditor(),
    toggleMouse: () => actions.toggleMouse(),
    quit: () => onQuit(),

    resetForNewDoc: reset => {
      if (reset === 'full') {
        actions.focus('viewer')
        actions.currentHeadingId(null)
        actions.search(null)
        actions.setExpanded(new Map())
        actions.tocCursorId(null)
        actions.visibleHeadingIds(new Set())
      } else if (reset === 'searchOnly') {
        actions.search(null)
      }
    },
    // Caller must ensure `id ∈ doc.headingIds` (the includes-guard/fallback lives at the call site).
    pinHeadingPostSwap: id => {
      viewerRef.current?.pinHeadingPostLayout(id, offsetFor(id))
      actions.currentHeadingId(id)
    },
    restoreScroll: ({ scrollTop, currentHeadingId }) => {
      const v = viewerRef.current
      if (!v) return
      // Retry-until-reached: a just-swapped doc mounts progressively, so a
      // one-shot scrollTo would clamp short of a deep saved offset. The final
      // heading state is re-resolved when the reposition settles (onRepositioned).
      v.pinScrollTop(scrollTop)
      if (currentHeadingId) actions.currentHeadingId(currentHeadingId)
    },
    resetToTop: () => {
      const v = viewerRef.current
      if (!v) return
      v.pinScrollTop(0)
      actions.currentHeadingId(null)
      actions.visibleHeadingIds(
        fold.resolveAt({ geom: v.getGeometry(), headingIds: doc.headingIds, topOffset: 0 })
          .visibleHeadingIds,
      )
    },
  }
}

/** A no-op `Commands` for non-interactive contexts (one-shot render) where no key/mouse input is dispatched. */
export function createNoopCommands(): Commands {
  const noop = () => {}
  return {
    scrollBy: noop,
    scrollPage: noop,
    scrollHalf: noop,
    scrollToTop: noop,
    scrollToBottom: noop,
    syncFromScroll: noop,
    jumpHeadingBy: noop,
    jumpToHeading: noop,
    jumpToCursor: noop,
    focusSidebar: noop,
    focusViewer: noop,
    tocMove: noop,
    toggleCursorExpanded: noop,
    toggleExpanded: noop,
    toggleTocVisible: noop,
    toggleHelp: noop,
    startSearch: noop,
    applySearchPattern: noop,
    stepMatch: noop,
    clearSearch: noop,
    followLink: noop,
    goBack: noop,
    goToDocument: noop,
    openEditor: noop,
    toggleMouse: noop,
    quit: noop,
    resetForNewDoc: noop,
    pinHeadingPostSwap: noop,
    restoreScroll: noop,
    resetToTop: noop,
  }
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
