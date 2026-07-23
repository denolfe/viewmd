import type { RefObject } from 'react'
import type { ScrollboxHandle, SearchState } from '../state'
import type { Node, TocEntry } from './ast'
import type { Focus } from './keys'
import type { DocReset } from './documentNavigation'
import { flattenVisible } from './toc-util'
import { foldOffset, resolveHeadings as resolveHeadingsPure } from './heading-resolution'
import { findHeadingNearTop, findVisibleHeadingIds } from './viewport-geometry'
import { findMatches } from './search'

export type CommandDeps = {
  viewerRef: RefObject<ScrollboxHandle | null>
  doc: { nodes: Node[]; toc: TocEntry[]; headingIds: string[]; fileLabel?: string }
  viewportHeight: number
  read: {
    currentHeadingId: string | null
    visibleHeadingIds: Set<string>
    expanded: Map<string, boolean>
    tocCursorId: string | null
    search: SearchState | null
    focus: Focus
    tocVisible: boolean
    historyDepth: number
  }
  set: {
    focus: (f: Focus) => void
    currentHeadingId: (id: string | null) => void
    visibleHeadingIds: (s: Set<string>) => void
    tocCursorId: (id: string | null) => void
    search: (s: SearchState | null) => void
    expanded: (m: Map<string, boolean>) => void
    toggleMouse: () => void
    toggleTocVisible: () => void
    toggleExpanded: (id: string) => void
  }
  onQuit: () => void
  onOpenEditor: () => void
  nav: { follow: (href: string) => void; back: () => void }
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
  startSearch(dir: 'forward' | 'backward'): void
  applySearchPattern(p: { pattern: string; commit: boolean }): void
  stepMatch(dir: 1 | -1): void
  clearSearch(): void
  followLink(href: string): void
  goBack(): void
  openEditor(): void
  toggleMouse(): void
  quit(): void
  resetForNewDoc(reset: DocReset): void
  pinHeadingPostSwap(id: string): void
  restoreScroll(p: { scrollTop: number; currentHeadingId: string | null }): void
  resetToTop(): void
}

export function createCommands(deps: CommandDeps): Commands {
  const { viewerRef, doc, viewportHeight, read, set, onQuit, onOpenEditor, nav } = deps

  // Rows the breadcrumb will show once `id` is pinned as the current heading: `id`
  // itself lands below the overlay (visible, so filtered out); its ancestors stack
  // above, plus the back badge when a history exists. Used as the pin/visibility
  // offset so a jump lands the target just below its crumbs rather than hidden
  // behind them. See `foldOffset` for the offset-convention rationale.
  const offsetFor = (id: string): number =>
    foldOffset({ toc: doc.toc, id, fileLabel: doc.fileLabel, historyDepth: read.historyDepth })

  const refreshVisible = (topOffset: number): void => {
    const v = viewerRef.current
    if (!v || doc.headingIds.length === 0) return
    const next = findVisibleHeadingIds(v.getGeometry(), doc.headingIds, topOffset)
    if (!setsEqual(read.visibleHeadingIds, next)) set.visibleHeadingIds(next)
  }

  // Resolve current + visible headings against live geometry and apply the setters
  // only on change. The breadcrumb overlay occludes the top rows, so resolution
  // measures against the content below the fold (see `resolveHeadings`).
  const resolveHeadings = (): void => {
    const v = viewerRef.current
    if (!v || doc.headingIds.length === 0) return
    const { currentHeadingId, visibleHeadingIds } = resolveHeadingsPure({
      geom: v.getGeometry(),
      toc: doc.toc,
      headingIds: doc.headingIds,
      fileLabel: doc.fileLabel,
      historyDepth: read.historyDepth,
    })
    if (currentHeadingId && currentHeadingId !== read.currentHeadingId) {
      set.currentHeadingId(currentHeadingId)
    }
    if (!setsEqual(read.visibleHeadingIds, visibleHeadingIds)) {
      set.visibleHeadingIds(visibleHeadingIds)
    }
  }

  const jumpTo = (id: string): void => {
    const height = offsetFor(id)
    viewerRef.current?.scrollChildToTop(id, height)
    set.currentHeadingId(id)
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
        read.currentHeadingId ?? (geom ? findHeadingNearTop(geom, doc.headingIds, 0) : null)
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
      set.focus('viewer')
    },
    jumpToCursor: () => {
      const id = read.tocCursorId
      if (id) {
        jumpTo(id)
        set.focus('viewer')
      }
    },

    focusSidebar: () => {
      if (doc.toc.length === 0 || !read.tocVisible) return
      const first = doc.toc[0]
      if (!read.tocCursorId && first) set.tocCursorId(first.id)
      set.focus('sidebar')
    },
    focusViewer: () => set.focus('viewer'),
    tocMove: dir => {
      const visible = flattenVisible(doc.toc, read.expanded)
      if (visible.length === 0) return
      const idx = Math.max(
        0,
        visible.findIndex(e => e.id === read.tocCursorId),
      )
      const ni = dir === 1 ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx - 1)
      const next = visible[ni]
      if (next) set.tocCursorId(next.id)
    },
    toggleCursorExpanded: () => {
      if (read.tocCursorId) set.toggleExpanded(read.tocCursorId)
    },
    toggleExpanded: id => set.toggleExpanded(id),
    toggleTocVisible: () => {
      if (read.tocVisible && read.focus === 'sidebar') set.focus('viewer')
      set.toggleTocVisible()
    },

    startSearch: dir => {
      set.search({ pattern: '', matches: [], index: -1, dir, committed: false })
      set.focus('search')
    },
    // Recompute matches from the passed `pattern`, not `read.search.pattern`: the
    // input's Enter can arrive before React re-renders, so committing a stale
    // snapshot would search a truncated/empty string.
    applySearchPattern: ({ pattern, commit }) => {
      const s = read.search
      if (!s) return
      const matches = findMatches(doc.nodes, pattern)
      const index = matches.length
        ? (viewerRef.current?.seedMatchIndex({ matches, dir: s.dir }) ?? 0)
        : -1
      set.search({ ...s, pattern, matches, index, committed: commit })
      if (commit) set.focus('viewer')
    },
    stepMatch: dir => {
      const s = read.search
      if (!s || s.matches.length === 0) return
      const total = s.matches.length
      const index = (((s.index + dir) % total) + total) % total
      set.search({ ...s, index })
    },
    clearSearch: () => {
      set.search(null)
      if (read.focus === 'search') set.focus('viewer')
    },

    followLink: href => nav.follow(href),
    goBack: () => nav.back(),
    openEditor: () => onOpenEditor(),
    toggleMouse: () => set.toggleMouse(),
    quit: () => onQuit(),

    resetForNewDoc: reset => {
      if (reset === 'full') {
        set.focus('viewer')
        set.currentHeadingId(null)
        set.search(null)
        set.expanded(new Map())
        set.tocCursorId(null)
        set.visibleHeadingIds(new Set())
      } else if (reset === 'searchOnly') {
        set.search(null)
      }
    },
    // Caller must ensure `id ∈ doc.headingIds` (the includes-guard/fallback lives at the call site).
    pinHeadingPostSwap: id => {
      viewerRef.current?.pinHeadingPostLayout(id, offsetFor(id))
      set.currentHeadingId(id)
    },
    restoreScroll: ({ scrollTop, currentHeadingId }) => {
      const v = viewerRef.current
      if (!v) return
      v.scrollTo(scrollTop)
      if (currentHeadingId) set.currentHeadingId(currentHeadingId)
      set.visibleHeadingIds(findVisibleHeadingIds(v.getGeometry(), doc.headingIds, 0))
    },
    resetToTop: () => {
      const v = viewerRef.current
      if (!v) return
      v.scrollTo(0)
      set.currentHeadingId(null)
      set.visibleHeadingIds(findVisibleHeadingIds(v.getGeometry(), doc.headingIds, 0))
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
    startSearch: noop,
    applySearchPattern: noop,
    stepMatch: noop,
    clearSearch: noop,
    followLink: noop,
    goBack: noop,
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
