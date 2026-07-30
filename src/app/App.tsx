import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dirname, resolve } from 'node:path'
import { flushSync, useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react'
import { AppStateContext, HeadingStateContext } from './state'
import type { AppState, HeadingState, ScrollboxHandle, Status } from './state'
import type { Action } from './lib/keys'
import type { Node, TocEntry } from './lib/ast'
import { mapKey } from './lib/keys'
import { useViewState } from './lib/view-state'
import { useLatest } from './lib/useLatest'
import { applyScrollIntent } from './lib/applyScrollIntent'
import { dispatch } from './lib/dispatch'
import { createCommands } from './lib/commands'
import { matchScrollTarget } from './lib/match-nav'
import { Viewer } from './components/Viewer'
import type { FrontmatterRow } from './lib/frontmatter'
import { Toc } from './components/Toc'
import { tocVisibleContentWidth } from './lib/toc-util'
import { FILE_ROW_ID } from './lib/overlay-rows'
import { createFold } from './lib/fold'
import { SearchBar } from './components/SearchBar'
import { HelpPanel } from './components/HelpPanel'
import { StickyHeader } from './components/StickyHeader'
import { StatusLine } from './components/StatusLine'
import { CONTENT_MAX_WIDTH, VIEWER_OVERHEAD } from './styles/layout'
import { theme } from './styles/theme'
import type { LoadedDocument } from './lib/loadDocument'
import { resolveEditorCommand, buildEditorArgv, openInEditor } from './lib/editor'
import { useDocumentNavigation } from './lib/documentNavigation'

// Actions whose imperative scroll must commit its heading state in the same
// frame (see `run`). Every action that both scrolls and re-resolves the current
// heading belongs here.
const SCROLL_ACTIONS = new Set<Action['kind']>([
  'scrollLine',
  'scrollPage',
  'scrollHalf',
  'top',
  'bottom',
  'nextHeading',
  'prevHeading',
  'tocSelect',
  'tocJump',
])

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
  // Opaque panel over the viewer while a swapped-in doc mounts and repositions,
  // so the reader never sees it painted at scrollTop 0 before the jump lands.
  const [covering, setCovering] = useState(false)

  // At startup the H1 (if any) sits at the top of the viewport — seed it so
  // the overlay's hide-when-visible rule fires on the first paint.
  const seedVisible = useMemo<Set<string>>(
    () => (initialToc[0]?.level === 1 ? new Set([initialToc[0].id]) : new Set()),
    [initialToc],
  )
  const { state: view, actions } = useViewState({ seedVisible })
  const stateRef = useLatest(view)

  const onError = useCallback((text: string) => setStatus({ kind: 'error', text }), [])
  // Reads the heading through `stateRef`: as a dependency it would rebuild
  // `commands` and the context value on every scrolled row.
  const captureScroll = useCallback(
    () => ({
      scrollTop: viewerRef.current?.getScrollTop() ?? 0,
      currentHeadingId: stateRef.current.currentHeadingId,
    }),
    [stateRef],
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

  // Raise the cover in the same render that swaps in the new doc, keyed on the
  // intent seq. A layout effect would commit the cover one render later, leaving a
  // gap where the incoming doc paints at scrollTop 0 before the jump lands. The
  // scroll seam drops it via onRepositioned once the reposition settles.
  const coverRaisedSeqRef = useRef(-1)
  if (nav.intent && nav.intent.reset !== 'none' && nav.intent.seq !== coverRaisedSeqRef.current) {
    coverRaisedSeqRef.current = nav.intent.seq
    if (!covering) setCovering(true)
  }

  const isTocShown = toc.length > 0 && view.tocVisible
  const { width: termWidth } = useTerminalDimensions()
  // The scrollbox inside the TOC consumes paddingX={1} (1 col each side = 2), + 1 buffer.
  const TOC_PADDING = 3
  // Size the TOC to its visible content, but never below 16 cols nor above 40%
  // of the terminal. Measuring only visible rows lets collapsing a wide subtree
  // shrink the sidebar so the viewer reclaims the freed columns.
  const tocWidth = Math.min(
    Math.floor(termWidth * 0.4),
    Math.max(16, tocVisibleContentWidth(toc, view.expanded) + TOC_PADDING),
  )
  const viewerColumnWidth = Math.max(
    1,
    (isTocShown ? termWidth - tocWidth : termWidth) - VIEWER_OVERHEAD,
  )
  const contentWidth = Math.min(contentMaxWidth, viewerColumnWidth)

  // Stable across nav; rebuilt only when the doc (toc/fileLabel) changes.
  const fold = useMemo(() => createFold({ toc, fileLabel }), [toc, fileLabel])

  // At the bottom the last heading is current, so its ancestor rows occlude the
  // top rows. Reserve that height in the scrollbox tail so the final content lands
  // just below the overlay instead of sliding up behind it.
  const lastHeadingId = headingIds.at(-1)
  const tailReserve = fold.tailReserve(lastHeadingId ?? null, nav.historyDepth)

  const trailLabels = nav.trailLabels

  useEffect(() => {
    if (!view.search?.committed || view.search.index < 0) return
    const m = view.search.matches[view.search.index]
    if (!m) return
    const v = viewerRef.current
    if (!v) return
    // Less-style jump: the match line scrolls to the top of the viewport,
    // below the sticky overlay. The scroll listener re-syncs heading
    // state, so no heading bookkeeping here. Uncommitted (live-typing) search
    // updates must never scroll — only Enter commits.
    const target = matchScrollTarget({ nodes, match: m, fold })
    v.jumpToMatch({
      match: m,
      matches: view.search.matches,
      index: view.search.index,
      topOffset: target?.topOffset ?? 0,
    })
  }, [view.search?.index, view.search?.pattern, view.search?.committed])

  // Populate visibleHeadingIds once after first layout so the overlay's
  // hide-when-visible rule fires before the user touches a key.
  useEffect(() => {
    if (headingIds.length === 0) return
    const tid = setTimeout(() => {
      const v = viewerRef.current
      if (!v) return
      actions.visibleHeadingIds(
        fold.resolveAt({ geom: v.getGeometry(), headingIds, topOffset: 0 }).visibleHeadingIds,
      )
    }, 0)
    return () => clearTimeout(tid)
  }, [headingIds, fold])

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
    commands.resetForNewDoc(it.reset)
    const tid = setTimeout(() => {
      applyScrollIntent({ scroll: it.scroll, commands, headingIds })
    }, 0)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.intent])

  const onOpenEditor = useCallback(() => {
    // Edit the doc currently on screen, not the CLI-arg file: nav may have swapped it.
    const activePath = nav.doc.absPath
    if (!activePath) {
      setStatus({ kind: 'error', text: 'Cannot edit: reading from stdin' })
      return
    }
    const currentHeadingId = stateRef.current.currentHeadingId
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
    // Depends on the `nav` members it uses, not the object: `nav` is fresh every
    // render and would make `commands` unstable.
  }, [nav.doc.absPath, nav.reload, renderer, headingLines, stateRef])

  const commands = useMemo(
    () =>
      createCommands({
        viewerRef,
        doc: { nodes, toc, headingIds, fileLabel },
        fold,
        viewportHeight: renderer.height,
        stateRef,
        actions,
        historyDepth: nav.historyDepth,
        onQuit: () => {
          // Silence the highlight-failed warning tree-sitter logs when
          // destroyTreeSitterClient rejects in-flight requests during shutdown.
          console.warn = () => {}
          renderer.destroy()
        },
        onOpenEditor,
        nav: { follow: nav.follow, back: nav.back, backTo: nav.backTo },
      }),
    [
      nodes,
      toc,
      headingIds,
      fileLabel,
      fold,
      renderer,
      // `useRenderer` is a stable singleton whose `.height` mutates in place on
      // resize; depend on the value so `scrollPage`/`scrollHalf` rebuild with the
      // new page size instead of the pre-resize one.
      renderer.height,
      nav.historyDepth,
      nav.follow,
      nav.back,
      nav.backTo,
      stateRef,
      actions,
      onOpenEditor,
    ],
  )

  const onViewerScroll = useCallback(() => commands.syncFromScroll(), [commands])
  const onViewerRepositioned = useCallback(() => {
    setCovering(false)
    commands.syncFromScroll()
  }, [commands])

  const headingState = useMemo<HeadingState>(
    () => ({
      currentHeadingId: view.currentHeadingId,
      visibleHeadingIds: view.visibleHeadingIds,
    }),
    [view.currentHeadingId, view.visibleHeadingIds],
  )

  // Depends on the `view` fields it reads, not `view` itself: any field write
  // makes a new ViewState, which would invalidate this on every scrolled row.
  const appState = useMemo<AppState>(
    () => ({
      focus: view.focus,
      viewerRef,
      expanded: view.expanded,
      tocCursorId: view.tocCursorId,
      search: view.search,
      contentWidth,
      contentMaxWidth,
      dir: nav.doc.dir,
      historyDepth: nav.historyDepth,
      trailLabels,
      status,
      helpVisible: view.helpVisible,
      commands,
    }),
    [
      view.focus,
      view.expanded,
      view.tocCursorId,
      view.search,
      view.helpVisible,
      contentWidth,
      contentMaxWidth,
      nav.doc.dir,
      nav.historyDepth,
      trailLabels,
      status,
      commands,
    ],
  )

  // A scroll/jump action mutates the scrollbox synchronously, but the
  // overlay-driving state it also sets (currentHeadingId/visibleHeadingIds)
  // is React state that would otherwise commit in a later microtask. The live
  // render loop can paint the scrolled content before that commit lands,
  // flashing the sticky-header overlay a frame behind the scroll. flushSync
  // commits the state in the same tick as the scroll so they paint together.
  // Scoped to scrolling actions: search/focus actions don't tear, and wrapping
  // them re-enters React during OpenTUI's keyboard dispatch and corrupts the
  // search-jump effect ordering.
  const run = (action: Action) =>
    SCROLL_ACTIONS.has(action.kind)
      ? flushSync(() => dispatch(action, commands))
      : dispatch(action, commands)

  useKeyboard(ev => {
    if (view.focus === 'search') return // SearchBar handles its own keys while typing
    run(mapKey(ev, view.focus, { searchActive: !!view.search, helpOpen: view.helpVisible }))
  })

  const dispatchTocAction = (action: Action) => run(action)
  const onEntryJump = (id: string) => dispatchTocAction({ kind: 'tocJump', id })
  const onEntryToggle = (id: string) => dispatchTocAction({ kind: 'tocToggleId', id })
  // The synth-root pill (no-H1 docs) is not a heading — scroll to the top via the
  // same `top` action g/gg use, so heading resolution stays on the canonical path.
  const onAncestorClick = (id: string) =>
    id === FILE_ROW_ID ? dispatchTocAction({ kind: 'top' }) : onEntryJump(id)

  return (
    <AppStateContext.Provider value={appState}>
      <HeadingStateContext.Provider value={headingState}>
        <box flexDirection="column" height="100%">
          <box flexDirection="row" flexGrow={1} overflow="hidden" position="relative">
            <StickyHeader toc={toc} fileLabel={fileLabel} onAncestorClick={onAncestorClick} />
            <SearchBar toc={toc} fileLabel={fileLabel} />
            <HelpPanel />
            <Viewer
              nodes={nodes}
              frontmatter={frontmatter}
              tailReserve={tailReserve}
              docKey={nav.doc.absPath ?? '<stdin>'}
              onScroll={onViewerScroll}
              onRepositioned={onViewerRepositioned}
            />
            {/* Opaque cover masking the swap-in reposition (see `covering`). Spans the
                viewer column (content + scrollbar + padding) and sits above the sticky
                header so the whole viewer reads as one clean transition. */}
            {covering && (
              <box
                position="absolute"
                top={0}
                left={0}
                width={contentWidth + VIEWER_OVERHEAD}
                height="100%"
                backgroundColor={theme.background}
                zIndex={20}
              />
            )}
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
      </HeadingStateContext.Provider>
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
