import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dirname, resolve } from 'node:path'
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle, SearchState, Status } from './state'
import type { Action, Focus } from './lib/keys'
import type { Node, TocEntry } from './lib/ast'
import { mapKey } from './lib/keys'
import { dispatch, syncHeadings } from './lib/dispatch'
import { matchScrollTarget } from './lib/match-nav'
import { Viewer } from './components/Viewer'
import type { FrontmatterRow } from './lib/frontmatter'
import { Toc } from './components/Toc'
import {
  backBadgeRowsForDepth,
  breadcrumbHeightForHeading,
  tocVisibleContentWidth,
  toggleTocExpanded,
} from './lib/toc-util'
import { SearchBar } from './components/SearchBar'
import { StickyHeader } from './components/StickyHeader'
import { StatusLine } from './components/StatusLine'
import { CONTENT_MAX_WIDTH } from './styles/layout'
import type { LoadedDocument } from './lib/loadDocument'
import { loadDocument, fileLabel as fileLabelFor } from './lib/loadDocument'
import { classifyHref } from './lib/links'
import { resolveEditorCommand, buildEditorArgv, openInEditor } from './lib/editor'

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
  const pendingReanchorRef = useRef<string | null>(null)
  const restoreScrollRef = useRef<{ scrollTop: number; currentHeadingId: string | null } | null>(
    null,
  )
  const [history, setHistory] = useState<
    { document: LoadedDocument; scrollTop: number; currentHeadingId: string | null }[]
  >([])

  const [doc, setDoc] = useState<LoadedDocument>(() => {
    const absPath = filePath ? resolve(filePath) : undefined
    return {
      nodes: initialNodes,
      toc: initialToc,
      headingIds: initialHeadingIds,
      frontmatter: initialFrontmatter,
      fileLabel: initialFileLabel,
      headingLines: initialHeadingLines,
      absPath,
      dir: absPath ? dirname(absPath) : undefined,
    }
  })
  const { nodes, toc, headingIds, frontmatter, fileLabel, headingLines } = doc
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

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

  const resetForNewDoc = useCallback(() => {
    setFocus('viewer')
    setCurrentHeadingId(null)
    setSearch(null)
    setExpanded(new Map())
    setTocCursorId(null)
    setVisibleHeadingIds(new Set())
  }, [])

  const followLink = useCallback(
    (href: string) => {
      const target = classifyHref({ baseDir: doc.dir, href })
      if (target.kind === 'ignore') return
      if (target.kind === 'anchor') {
        viewerRef.current?.scrollChildToTop(target.id)
        return
      }
      // A link back into the current file is an in-doc jump, not a reload.
      if (target.absPath === doc.absPath) {
        if (target.anchor) viewerRef.current?.scrollChildToTop(target.anchor)
        else viewerRef.current?.scrollTo(0)
        return
      }
      const scrollTop = viewerRef.current?.getScrollTop() ?? 0
      loadDocument(target.absPath)
        .then(next => {
          setHistory(h => [...h, { document: doc, scrollTop, currentHeadingId }])
          resetForNewDoc()
          pendingReanchorRef.current = target.anchor ?? null
          setDoc(next)
        })
        .catch(() => {
          setStatus({ kind: 'error', text: `Cannot open ${fileLabelFor(target.absPath)}` })
        })
    },
    [doc, currentHeadingId, resetForNewDoc],
  )

  const goBack = useCallback(() => {
    const entry = history[history.length - 1]
    if (!entry) return
    resetForNewDoc()
    pendingReanchorRef.current = null
    restoreScrollRef.current = {
      scrollTop: entry.scrollTop,
      currentHeadingId: entry.currentHeadingId,
    }
    setDoc(entry.document)
    setHistory(h => h.slice(0, -1))
  }, [history, resetForNewDoc])

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
        backBadgeRows: backBadgeRowsForDepth(history.length),
      })
    : 0

  const backLabel = history[history.length - 1]?.document.fileLabel
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
      dir: doc.dir,
      followLink,
      goBack,
      historyDepth: history.length,
      backLabel,
      status,
      setStatus,
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
      doc.dir,
      followLink,
      goBack,
      history.length,
      backLabel,
      status,
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

  useEffect(() => {
    if (status.kind === 'idle') return
    const tid = setTimeout(() => setStatus({ kind: 'idle' }), 2500)
    return () => clearTimeout(tid)
  }, [status])

  // After any doc swap (editor reload, followLink, goBack) position scroll once
  // the new content mounts. restoreScrollRef (goBack) wins; else pin the pending
  // heading id (editor reload / followLink anchor); else go to top. On first mount
  // both refs are null and this harmlessly re-pins the top.
  //
  // Keyed on `nodes` only: safe because `doc` updates atomically, so toc/headingIds/
  // fileLabel captured here are always fresh whenever `nodes` changes.
  useEffect(() => {
    const restore = restoreScrollRef.current
    const target = pendingReanchorRef.current
    restoreScrollRef.current = null
    pendingReanchorRef.current = null
    const tid = setTimeout(() => {
      const v = viewerRef.current
      if (!v) return
      if (restore) {
        v.scrollTo(restore.scrollTop)
        if (restore.currentHeadingId) setCurrentHeadingId(restore.currentHeadingId)
        setVisibleHeadingIds(v.getVisibleHeadingIds(headingIds))
        return
      }
      // Pin the anchor target post-layout: right after a doc swap its box is
      // committed but unlaid-out (reads y=0), so an effect-time scroll would
      // strand the reader at the top. onFrame runs the pin once geometry is real;
      // its scroll re-syncs the breadcrumb, so no visibility bookkeeping here.
      // setCurrentHeadingId seeds a sensible value before that frame lands.
      if (target && headingIds.includes(target)) {
        const height = breadcrumbHeightForHeading({
          toc,
          id: target,
          fileLabel,
          backBadgeRows: backBadgeRowsForDepth(history.length),
        })
        v.pinHeadingPostLayout(target, height)
        setCurrentHeadingId(target)
      } else {
        v.scrollTo(0)
        setCurrentHeadingId(null)
        setVisibleHeadingIds(v.getVisibleHeadingIds(headingIds))
      }
    }, 0)
    return () => clearTimeout(tid)
  }, [nodes])

  const onOpenEditor = useCallback(() => {
    // Edit the document currently on screen, not the CLI-arg file: followLink/
    // goBack may have swapped `doc` to another file since launch.
    const activePath = doc.absPath
    if (!activePath) {
      setStatus({ kind: 'error', text: 'Cannot edit: reading from stdin' })
      return
    }
    pendingReanchorRef.current = currentHeadingId
    const line = currentHeadingId ? headingLines[currentHeadingId] : undefined
    const argv = buildEditorArgv({
      command: resolveEditorCommand(process.env),
      filePath: activePath,
      line,
    })
    const result = openInEditor({ renderer, argv })
    if (!result.ok) {
      setStatus({ kind: 'error', text: `Editor failed: ${result.error}` })
      pendingReanchorRef.current = null
      return
    }
    loadDocument(activePath)
      .then(next => setDoc(next))
      .catch(() => {
        setStatus({ kind: 'error', text: 'Reload failed: file unreadable' })
        pendingReanchorRef.current = null
      })
  }, [doc.absPath, currentHeadingId, renderer, headingLines])

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
      onOpenEditor,
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
            docKey={doc.absPath ?? '<stdin>'}
            onScroll={() => syncHeadings(state, toc, headingIds, fileLabel)}
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
