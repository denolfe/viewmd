import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle, SearchState } from './state'
import type { Action, Focus } from './lib/keys'
import type { Node, TocEntry } from './lib/ast'
import { mapKey } from './lib/keys'
import { dispatch, syncHeadings } from './lib/dispatch'
import { matchScrollTarget } from './lib/match-nav'
import { Viewer } from './components/Viewer'
import type { FrontmatterRow } from './lib/frontmatter'
import { Toc } from './components/Toc'
import {
  breadcrumbHeightForHeading,
  tocVisibleContentWidth,
  toggleTocExpanded,
  truncateLabelLeft,
} from './lib/toc-util'
import { theme } from './styles/theme'
import { SearchBar } from './components/SearchBar'
import { StickyHeader } from './components/StickyHeader'
import { CONTENT_MAX_WIDTH } from './styles/layout'

type Props = {
  nodes: Node[]
  toc: TocEntry[]
  headingIds: string[]
  frontmatter: FrontmatterRow[]
  fileLabel?: string
}

export function App({ nodes, toc, headingIds, frontmatter, fileLabel }: Props) {
  const renderer = useRenderer()
  const viewerRef = useRef<ScrollboxHandle | null>(null)

  const [focus, setFocus] = useState<Focus>('viewer')
  const [currentHeadingId, setCurrentHeadingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Map<string, boolean>>(() => new Map())
  const [tocCursorId, setTocCursorId] = useState<string | null>(null)
  const [search, setSearch] = useState<SearchState | null>(null)
  const [mouseEnabled, setMouseEnabled] = useState(false)
  const [tocVisible, setTocVisible] = useState(true)
  const [visibleHeadingIds, setVisibleHeadingIds] = useState<Set<string>>(() =>
    // At startup the H1 (if any) sits at the top of the viewport — seed it so
    // the breadcrumb's hide-when-visible rule fires on the first paint.
    toc[0]?.level === 1 ? new Set([toc[0].id]) : new Set(),
  )

  const toggleExpanded = useCallback(
    (id: string) => {
      setExpanded(prev => toggleTocExpanded({ toc, expanded: prev, id }))
    },
    [toc],
  )
  const toggleMouse = useCallback(() => setMouseEnabled(m => !m), [])
  const toggleTocVisible = useCallback(() => setTocVisible(v => !v), [])

  const isTocShown = toc.length > 0 && tocVisible
  const { width: termWidth } = useTerminalDimensions()
  // The scrollbox inside the TOC consumes paddingX={1} (1 col each side = 2), + 1 buffer.
  const TOC_PADDING = 3
  // Size the TOC to its visible content, but never below 16 cols nor above 40%
  // of the terminal. Measuring only visible rows lets collapsing a wide subtree
  // shrink the sidebar so the viewer reclaims the freed columns.
  const tocWidth = Math.min(
    Math.floor(termWidth * 0.4),
    Math.max(16, tocVisibleContentWidth(toc, expanded) + TOC_PADDING),
  )
  // Viewer reserves 1 col for the vertical scrollbar and the inner box adds paddingRight={1}.
  const VIEWER_OVERHEAD = 2
  const viewerColumnWidth = Math.max(
    1,
    (isTocShown ? termWidth - tocWidth : termWidth) - VIEWER_OVERHEAD,
  )
  const contentWidth = Math.min(CONTENT_MAX_WIDTH, viewerColumnWidth)

  // At the bottom the last heading is current, so its ancestor crumbs occlude the
  // top rows. Reserve that height in the scrollbox tail so the final content lands
  // just below the overlay instead of sliding up behind it.
  const lastHeadingId = headingIds.at(-1)
  const tailReserve = lastHeadingId
    ? breadcrumbHeightForHeading({ toc, id: lastHeadingId, fileLabel })
    : 0

  const state = useMemo<AppState>(
    () => ({
      focus,
      setFocus,
      currentHeadingId,
      setCurrentHeadingId,
      viewerRef,
      expanded,
      toggleExpanded,
      tocCursorId,
      setTocCursorId,
      search,
      setSearch,
      mouseEnabled,
      toggleMouse,
      tocVisible,
      toggleTocVisible,
      visibleHeadingIds,
      setVisibleHeadingIds,
      contentWidth,
    }),
    [
      focus,
      currentHeadingId,
      tocCursorId,
      search,
      expanded,
      mouseEnabled,
      toggleExpanded,
      toggleMouse,
      tocVisible,
      toggleTocVisible,
      visibleHeadingIds,
      contentWidth,
    ],
  )

  useEffect(() => {
    if (!search?.committed || search.index < 0) return
    const m = search.matches[search.index]
    if (!m) return
    const v = viewerRef.current
    if (!v) return
    // Less-style jump: the match line scrolls to the top of the viewport,
    // below the breadcrumb overlay. The scroll listener re-syncs breadcrumb
    // state, so no heading bookkeeping here. Uncommitted (live-typing) search
    // updates must never scroll — only Enter commits.
    const target = matchScrollTarget({ nodes, toc, match: m, fileLabel })
    v.jumpToMatch({
      match: m,
      matches: search.matches,
      index: search.index,
      topOffset: target?.topOffset ?? 0,
    })
  }, [search?.index, search?.pattern, search?.committed])

  // Populate visibleHeadingIds once after first layout so the breadcrumb's
  // hide-when-visible rule fires before the user touches a key.
  useEffect(() => {
    if (headingIds.length === 0) return
    const tid = setTimeout(() => {
      const v = viewerRef.current
      if (!v) return
      setVisibleHeadingIds(v.getVisibleHeadingIds(headingIds))
    }, 0)
    return () => clearTimeout(tid)
  }, [headingIds])

  useKeyboard(ev => {
    if (focus === 'search') return // SearchBar handles its own keys while typing
    const action = mapKey(ev, focus, { searchActive: !!search })
    dispatch(
      action,
      state,
      toc,
      headingIds,
      renderer.height,
      () => {
        // Silence the highlight-failed warning that tree-sitter logs when
        // destroyTreeSitterClient rejects in-flight requests during shutdown.
        console.warn = () => {}
        renderer.destroy()
      },
      fileLabel,
    )
  })

  const dispatchTocAction = (action: Action) =>
    dispatch(action, state, toc, headingIds, renderer.height, () => {}, fileLabel)
  const onEntryJump = (id: string) => dispatchTocAction({ kind: 'tocJump', id })
  const onEntryToggle = (id: string) => dispatchTocAction({ kind: 'tocToggleId', id })

  return (
    <AppStateContext.Provider value={state}>
      <box flexDirection="column" height="100%">
        <box flexDirection="row" flexGrow={1} overflow="hidden" position="relative">
          <StickyHeader toc={toc} fileLabel={fileLabel} />
          <SearchBar nodes={nodes} toc={toc} fileLabel={fileLabel} />
          <Viewer
            nodes={nodes}
            frontmatter={frontmatter}
            tailReserve={tailReserve}
            onScroll={() => syncHeadings(state, toc, headingIds, fileLabel)}
          />
          {/* Toggle `visible` rather than unmounting: remounting the TOC scrollbox
              makes it flash its own vertical scrollbar for one frame before layout
              settles. `visible={false}` still frees the column so the viewer reclaims
              the width. */}
          {toc.length > 0 && (
            <box width={tocWidth} border={false} visible={isTocShown} flexDirection="column">
              <Toc toc={toc} onEntryJump={onEntryJump} onEntryToggle={onEntryToggle} />
              {fileLabel && (
                <box paddingLeft={3} paddingRight={1}>
                  <text fg={theme.foregroundMuted}>
                    {truncateLabelLeft(fileLabel, tocWidth - 4)}
                  </text>
                </box>
              )}
            </box>
          )}
        </box>
      </box>
    </AppStateContext.Provider>
  )
}
