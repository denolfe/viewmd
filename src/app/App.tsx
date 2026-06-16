import { useCallback, useMemo, useRef, useState } from 'react'
import { useKeyboard, useRenderer } from '@opentui/react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle } from './state'
import type { Focus } from './keys'
import type { Node, TocEntry } from './ast'
import { mapKey } from './keys'
import { Viewer } from './Viewer'
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

  useKeyboard(ev => {
    const action = mapKey(ev, focus, { searchActive: !!search })
    switch (action.kind) {
      case 'quit':
        renderer.destroy()
        return
      case 'scrollLine':
        viewerRef.current?.scrollBy(action.delta)
        return
      case 'scrollPage':
        viewerRef.current?.scrollBy(action.delta * (renderer.height - 2))
        return
      case 'scrollHalf':
        viewerRef.current?.scrollBy(action.delta * Math.floor((renderer.height - 2) / 2))
        return
      case 'top':
        viewerRef.current?.scrollTo(0)
        return
      case 'bottom':
        viewerRef.current?.scrollToBottom()
        return
      case 'focusSidebar':
        if (toc.length) setFocus('sidebar')
        return
      case 'focusViewer':
        setFocus('viewer')
        return
      // nextHeading/prevHeading/tocSelect/search wired in later tasks
    }
  })

  const hasToc = toc.length > 0

  return (
    <AppStateContext.Provider value={state}>
      <box flexDirection="column" height="100%">
        <StickyHeader toc={toc} title={title} />
        <box flexDirection="row" flexGrow={1}>
          {hasToc && (
            <box width={28} borderColor="#666666">
              <text fg="#9d9d9d">TOC (Task 9)</text>
            </box>
          )}
          <Viewer nodes={nodes} />
        </box>
        <StatusLine />
      </box>
    </AppStateContext.Provider>
  )
}
