import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle } from './state'
import type { Focus } from './keys'
import type { Node, TocEntry } from './ast'
import { mapKey } from './keys'
import { dispatch } from './dispatch'
import { nearestPrecedingHeadingId } from './match-nav'
import { Viewer } from './Viewer'
import { Toc } from './Toc'
import { tocContentWidth } from './toc-util'
import { StatusLine } from './StatusLine'
import { StickyHeader } from './StickyHeader'

type Props = { nodes: Node[]; toc: TocEntry[]; title: string }

export function App({ nodes, toc, title }: Props) {
  const renderer = useRenderer()
  const viewerRef = useRef<ScrollboxHandle | null>(null)

  const [focus, setFocus] = useState<Focus>('viewer')
  const [currentHeadingId, setCurrentHeadingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Map<string, boolean>>(() => new Map())
  const [tocCursorId, setTocCursorId] = useState<string | null>(null)
  const [search, setSearch] = useState<AppState['search']>(null)
  const [mouseEnabled, setMouseEnabled] = useState(false)

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Map(prev)
      next.set(id, !(prev.get(id) ?? true))
      return next
    })
  }, [])
  const toggleMouse = useCallback(() => setMouseEnabled(m => !m), [])

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
    ],
  )

  useEffect(() => {
    if (!search || search.index < 0) return
    const m = search.matches[search.index]
    if (!m) return
    const headingId = nearestPrecedingHeadingId(nodes, m)
    if (headingId) viewerRef.current?.scrollChildIntoView(headingId)
  }, [search?.index, search?.pattern])

  useKeyboard(ev => {
    if (focus === 'search') return // Search overlay handles its own keys in Task 11
    const action = mapKey(ev, focus, { searchActive: !!search })
    dispatch(action, state, toc, renderer.height, () => renderer.destroy())
  })

  const hasToc = toc.length > 0
  const { width: termWidth } = useTerminalDimensions()
  // The scrollbox inside the TOC consumes paddingX={1} (1 col each side = 2), + 1 buffer.
  const TOC_PADDING = 3
  // Size the TOC to its content, but never below 16 cols nor above 40% of the terminal.
  const tocWidth = Math.min(Math.floor(termWidth * 0.4), Math.max(16, tocContentWidth(toc) + TOC_PADDING))

  return (
    <AppStateContext.Provider value={state}>
      <box flexDirection="column" height="100%">
        <StickyHeader toc={toc} title={title} />
        <box flexDirection="row" flexGrow={1}>
          <Viewer nodes={nodes} />
          {hasToc && (
            <box width={tocWidth} borderColor="#666666">
              <Toc toc={toc} />
            </box>
          )}
        </box>
        <StatusLine nodes={nodes} />
      </box>
    </AppStateContext.Provider>
  )
}
