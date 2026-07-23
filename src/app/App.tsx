import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dirname, resolve } from 'node:path'
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle, SearchState, Status } from './state'
import type { Action, Focus } from './lib/keys'
import type { Node, TocEntry } from './lib/ast'
import { mapKey } from './lib/keys'
import { dispatch } from './lib/dispatch'
import { createCommands } from './lib/commands'
import { matchScrollTarget } from './lib/match-nav'
import { Viewer } from './components/Viewer'
import type { FrontmatterRow } from './lib/frontmatter'
import { Toc } from './components/Toc'
import {
  backBadgeRowsForDepth,
  breadcrumbHeightForHeading,
  tocVisibleContentWidth,
  toggleTocExpanded,
  FILE_ROW_ID,
} from './lib/toc-util'
import { SearchBar } from './components/SearchBar'
import { StickyHeader } from './components/StickyHeader'
import { StatusLine } from './components/StatusLine'
import { CONTENT_MAX_WIDTH, VIEWER_OVERHEAD } from './styles/layout'
import type { LoadedDocument } from './lib/loadDocument'
import { resolveEditorCommand, buildEditorArgv, openInEditor } from './lib/editor'
import { useDocumentNavigation } from './lib/documentNavigation'
import type { DocReset, ScrollIntent } from './lib/documentNavigation'

type Props = {
  nodes: Node[]
  toc: TocEntry[]
  headingIds: string[]
  frontmatter: FrontmatterRow[]
  fileLabel?: string
  contentMaxWidth?: number
  filePath?: string
  headingLines: Record<string, number>
}

export function App({
  nodes: initialNodes,
  toc: initialToc,
  headingIds: initialHeadingIds,
  frontmatter: initialFrontmatter,
  fileLabel: initialFileLabel,
  filePath,
  contentMaxWidth = CONTENT_MAX_WIDTH,
  headingLines: initialHeadingLines,
}: Props) {
  const renderer = useRenderer()
  const viewerRef = useRef<ScrollboxHandle | null>(null)

  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [currentHeadingId, setCurrentHeadingId] = useState<string | null>(null)
  const [focus, setFocus] = useState<Focus>('viewer')
  const [expanded, setExpanded] = useState<Map<string, boolean>>(() => new Map())
  const [tocCursorId, setTocCursorId] = useState<string | null>(null)
  const [search, setSearch] = useState<SearchState | null>(null)
  const [mouseEnabled, setMouseEnabled] = useState(false)
  const [tocVisible, setTocVisible] = useState(true)
  const [visibleHeadingIds, setVisibleHeadingIds] = useState<Set<string>>(() =>
    // At startup the H1 (if any) sits at the top of the viewport — seed it so
    // the breadcrumb's hide-when-visible rule fires on the first paint.
    initialToc[0]?.level === 1 ? new Set([initialToc[0].id]) : new Set(),
  )

  const onError = useCallback((text: string) => setStatus({ kind: 'error', text }), [])
  const captureScroll = useCallback(
    () => ({ scrollTop: viewerRef.current?.getScrollTop() ?? 0, currentHeadingId }),
    [currentHeadingId],
  )
  const initialDoc = useMemo(
    () =>
      seedDocFromProps({
        nodes: initialNodes,
        toc: initialToc,
        headingIds: initialHeadingIds,
        frontmatter: initialFrontmatter,
        fileLabel: initialFileLabel,
        headingLines: initialHeadingLines,
        filePath,
      }),
    // Seed computed once from the launch props; later docs come from the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const nav = useDocumentNavigation({ initialDoc, captureScroll, onError })
  const { nodes, toc, headingIds, frontmatter, fileLabel, headingLines } = nav.doc

  const applyReset = useCallback((reset: DocReset) => {
    if (reset === 'full') {
      setFocus('viewer')
      setCurrentHeadingId(null)
      setSearch(null)
      setExpanded(new Map())
      setTocCursorId(null)
      setVisibleHeadingIds(new Set())
    } else if (reset === 'searchOnly') {
      setSearch(null)
    }
  }, [])

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
  const viewerColumnWidth = Math.max(
    1,
    (isTocShown ? termWidth - tocWidth : termWidth) - VIEWER_OVERHEAD,
  )
  const contentWidth = Math.min(contentMaxWidth, viewerColumnWidth)

  // At the bottom the last heading is current, so its ancestor crumbs occlude the
  // top rows. Reserve that height in the scrollbox tail so the final content lands
  // just below the overlay instead of sliding up behind it.
  const lastHeadingId = headingIds.at(-1)
  const tailReserve = lastHeadingId
    ? breadcrumbHeightForHeading({
        toc,
        id: lastHeadingId,
        fileLabel,
        backBadgeRows: backBadgeRowsForDepth(nav.historyDepth),
      })
    : 0

  const backLabel = nav.backLabel

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

  useEffect(() => {
    if (status.kind === 'idle') return
    const tid = setTimeout(() => setStatus({ kind: 'idle' }), 2500)
    return () => clearTimeout(tid)
  }, [status])

  // Consume the latest navigation intent. Reset runs synchronously (pre-paint) so
  // the new doc never renders against a stale currentHeadingId; the scroll defers
  // one tick because a just-swapped box is committed but unlaid-out (reads y=0).
  // nav.intent and nav.doc update in the same render, so headingIds/toc/fileLabel
  // closed over here are always consistent with the intent.
  useLayoutEffect(() => {
    const it = nav.intent
    if (!it) return
    applyReset(it.reset)
    const tid = setTimeout(() => {
      const v = viewerRef.current
      if (!v) return
      applyScrollIntent({
        viewer: v,
        scroll: it.scroll,
        toc,
        headingIds,
        fileLabel,
        historyDepth: nav.historyDepth,
        setCurrentHeadingId,
        setVisibleHeadingIds,
      })
    }, 0)
    return () => clearTimeout(tid)
  }, [nav.intent])

  const onOpenEditor = useCallback(() => {
    // Edit the doc currently on screen, not the CLI-arg file: nav may have swapped it.
    const activePath = nav.doc.absPath
    if (!activePath) {
      setStatus({ kind: 'error', text: 'Cannot edit: reading from stdin' })
      return
    }
    const line = currentHeadingId ? headingLines[currentHeadingId] : undefined
    const argv = buildEditorArgv({
      command: resolveEditorCommand(process.env),
      filePath: activePath,
      line,
    })
    const result = openInEditor({ renderer, argv })
    if (!result.ok) {
      setStatus({ kind: 'error', text: `Editor failed: ${result.error}` })
      return
    }
    nav.reload()
  }, [nav, currentHeadingId, renderer, headingLines])

  const commands = useMemo(
    () =>
      createCommands({
        viewerRef,
        doc: { nodes, toc, headingIds, fileLabel },
        viewportHeight: renderer.height,
        read: {
          currentHeadingId,
          visibleHeadingIds,
          expanded,
          tocCursorId,
          search,
          focus,
          tocVisible,
          historyDepth: nav.historyDepth,
        },
        set: {
          focus: setFocus,
          currentHeadingId: setCurrentHeadingId,
          visibleHeadingIds: setVisibleHeadingIds,
          tocCursorId: setTocCursorId,
          search: setSearch,
          expanded: setExpanded,
          toggleMouse,
          toggleTocVisible,
          toggleExpanded,
        },
        onQuit: () => {
          // Silence the highlight-failed warning tree-sitter logs when
          // destroyTreeSitterClient rejects in-flight requests during shutdown.
          console.warn = () => {}
          renderer.destroy()
        },
        onOpenEditor,
        nav: { follow: nav.follow, back: nav.back },
      }),
    [
      nodes,
      toc,
      headingIds,
      fileLabel,
      renderer,
      currentHeadingId,
      visibleHeadingIds,
      expanded,
      tocCursorId,
      search,
      focus,
      tocVisible,
      nav.historyDepth,
      nav.follow,
      nav.back,
      toggleMouse,
      toggleTocVisible,
      toggleExpanded,
      onOpenEditor,
    ],
  )

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
      contentMaxWidth,
      dir: nav.doc.dir,
      followLink: nav.follow,
      goBack: nav.back,
      historyDepth: nav.historyDepth,
      backLabel,
      status,
      setStatus,
      commands,
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
      contentMaxWidth,
      nav.doc.dir,
      nav.follow,
      nav.back,
      nav.historyDepth,
      backLabel,
      status,
      commands,
    ],
  )

  useKeyboard(ev => {
    if (focus === 'search') return // SearchBar handles its own keys while typing
    const action = mapKey(ev, focus, { searchActive: !!search })
    dispatch(action, commands)
  })

  const dispatchTocAction = (action: Action) => dispatch(action, commands)
  const onEntryJump = (id: string) => dispatchTocAction({ kind: 'tocJump', id })
  const onEntryToggle = (id: string) => dispatchTocAction({ kind: 'tocToggleId', id })
  // The synth-root pill (no-H1 docs) is not a heading — scroll to the top via the
  // same `top` action g/gg use, so heading resolution stays on the canonical path.
  const onCrumbClick = (id: string) =>
    id === FILE_ROW_ID ? dispatchTocAction({ kind: 'top' }) : onEntryJump(id)

  return (
    <AppStateContext.Provider value={state}>
      <box flexDirection="column" height="100%">
        <box flexDirection="row" flexGrow={1} overflow="hidden" position="relative">
          <StickyHeader toc={toc} fileLabel={fileLabel} onCrumbClick={onCrumbClick} />
          <SearchBar nodes={nodes} toc={toc} fileLabel={fileLabel} />
          <Viewer
            nodes={nodes}
            frontmatter={frontmatter}
            tailReserve={tailReserve}
            docKey={nav.doc.absPath ?? '<stdin>'}
            onScroll={() => commands.syncFromScroll()}
          />
          {/* Toggle `visible` rather than unmounting: remounting the TOC scrollbox
              makes it flash its own vertical scrollbar for one frame before layout
              settles. `visible={false}` still frees the column so the viewer reclaims
              the width. */}
          {toc.length > 0 && (
            <box width={tocWidth} border={false} visible={isTocShown} flexDirection="column">
              <Toc toc={toc} onEntryJump={onEntryJump} onEntryToggle={onEntryToggle} />
            </box>
          )}
        </box>
        <StatusLine fileLabel={fileLabel} />
      </box>
    </AppStateContext.Provider>
  )
}

function seedDocFromProps(props: {
  nodes: Node[]
  toc: TocEntry[]
  headingIds: string[]
  frontmatter: FrontmatterRow[]
  fileLabel?: string
  headingLines: Record<string, number>
  filePath?: string
}): LoadedDocument {
  const absPath = props.filePath ? resolve(props.filePath) : undefined
  return {
    nodes: props.nodes,
    toc: props.toc,
    headingIds: props.headingIds,
    frontmatter: props.frontmatter,
    fileLabel: props.fileLabel,
    headingLines: props.headingLines,
    absPath,
    dir: absPath ? dirname(absPath) : undefined,
  }
}

function applyScrollIntent(params: {
  viewer: ScrollboxHandle
  scroll: ScrollIntent
  toc: TocEntry[]
  headingIds: string[]
  fileLabel?: string
  historyDepth: number
  setCurrentHeadingId: (id: string | null) => void
  setVisibleHeadingIds: (s: Set<string>) => void
}): void {
  const { viewer, scroll, toc, headingIds, fileLabel, historyDepth } = params
  const { setCurrentHeadingId, setVisibleHeadingIds } = params

  if (scroll.kind === 'restore') {
    viewer.scrollTo(scroll.scrollTop)
    if (scroll.currentHeadingId) setCurrentHeadingId(scroll.currentHeadingId)
    setVisibleHeadingIds(viewer.getVisibleHeadingIds(headingIds))
    return
  }

  if (scroll.kind === 'anchor' && !scroll.postSwap) {
    viewer.scrollChildToTop(scroll.headingId)
    return
  }

  if (scroll.kind === 'anchor' && headingIds.includes(scroll.headingId)) {
    // Pin post-layout: the box is committed but reads y=0 right after a swap, so
    // pinHeadingPostLayout runs the scroll once geometry is real; its scroll
    // re-syncs the breadcrumb, so no visibility bookkeeping here.
    const height = breadcrumbHeightForHeading({
      toc,
      id: scroll.headingId,
      fileLabel,
      backBadgeRows: backBadgeRowsForDepth(historyDepth),
    })
    viewer.pinHeadingPostLayout(scroll.headingId, height)
    setCurrentHeadingId(scroll.headingId)
    return
  }

  // `top`, or a postSwap anchor whose id is absent from the swapped-in doc.
  viewer.scrollTo(0)
  setCurrentHeadingId(null)
  setVisibleHeadingIds(viewer.getVisibleHeadingIds(headingIds))
}
