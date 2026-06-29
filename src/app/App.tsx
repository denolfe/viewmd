import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle, SearchState } from './state'
import type { Focus } from './lib/keys'
import type { Node, TocEntry } from './lib/ast'
import { mapKey } from './lib/keys'
import { dispatch, syncHeadings } from './lib/dispatch'
import { nearestPrecedingHeadingId } from './lib/match-nav'
import { Viewer } from './components/Viewer'
import type { FrontmatterRow } from './lib/frontmatter'
import { Toc } from './components/Toc'
import { tocContentWidth } from './lib/toc-util'
import { StatusLine } from './components/StatusLine'
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
  const [visibleHeadingIds, setVisibleHeadingIds] = useState<Set<string>>(() =>
    // At startup the H1 (if any) sits at the top of the viewport — seed it so
    // the breadcrumb's hide-when-visible rule fires on the first paint.
    toc[0]?.level === 1 ? new Set([toc[0].id]) : new Set(),
  )

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Map(prev)
      next.set(id, !(prev.get(id) ?? true))
      return next
    })
  }, [])
  const toggleMouse = useCallback(() => setMouseEnabled(m => !m), [])

  const hasToc = toc.length > 0
  const { width: termWidth } = useTerminalDimensions()
  // The scrollbox inside the TOC consumes paddingX={1} (1 col each side = 2), + 1 buffer.
  const TOC_PADDING = 3
  // Size the TOC to its content, but never below 16 cols nor above 40% of the terminal.
  const tocWidth = Math.min(
    Math.floor(termWidth * 0.4),
    Math.max(16, tocContentWidth(toc) + TOC_PADDING),
  )
  // Viewer reserves 1 col for the vertical scrollbar and the inner box adds paddingRight={1}.
  const VIEWER_OVERHEAD = 2
  const viewerColumnWidth = Math.max(
    1,
    (hasToc ? termWidth - tocWidth : termWidth) - VIEWER_OVERHEAD,
  )
  const contentWidth = Math.min(CONTENT_MAX_WIDTH, viewerColumnWidth)

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
      visibleHeadingIds,
      contentWidth,
    ],
  )

  useEffect(() => {
    if (!search || search.index < 0) return
    const m = search.matches[search.index]
    if (!m) return
    const headingId = nearestPrecedingHeadingId(nodes, m)
    if (headingId) viewerRef.current?.scrollChildIntoView(headingId)
  }, [search?.index, search?.pattern])

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
    if (focus === 'search') return // Search overlay handles its own keys in Task 11
    const action = mapKey(ev, focus, { searchActive: !!search })
    dispatch(action, state, toc, headingIds, renderer.height, () => {
      // Silence the highlight-failed warning that tree-sitter logs when
      // destroyTreeSitterClient rejects in-flight requests during shutdown.
      console.warn = () => {}
      renderer.destroy()
    })
  })

  return (
    <AppStateContext.Provider value={state}>
      <box flexDirection="column" height="100%">
        <StickyHeader toc={toc} fileLabel={fileLabel} />
        <box flexDirection="row" flexGrow={1} overflow="hidden">
          <Viewer
            nodes={nodes}
            frontmatter={frontmatter}
            onScroll={() => syncHeadings(state, headingIds)}
          />
          {hasToc && (
            <box width={tocWidth} border={false}>
              <Toc toc={toc} />
            </box>
          )}
        </box>
        <StatusLine nodes={nodes} />
      </box>
    </AppStateContext.Provider>
  )
}
