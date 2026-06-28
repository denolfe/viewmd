import { useMemo, useRef } from 'react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle } from './state'
import { NodeList } from './components/blocks/NodeRenderer'
import { CONTENT_MAX_WIDTH } from './styles/layout'
import type { Node } from './lib/ast'

type Props = { nodes: Node[]; width: number }

export function RenderView({ nodes, width }: Props) {
  const viewerRef = useRef<ScrollboxHandle | null>(null)

  const state = useMemo<AppState>(
    () => ({
      focus: 'viewer',
      setFocus: () => {},
      currentHeadingId: null,
      setCurrentHeadingId: () => {},
      visibleHeadingIds: new Set(),
      setVisibleHeadingIds: () => {},
      viewerRef,
      expanded: new Map(),
      toggleExpanded: () => {},
      tocCursorId: null,
      setTocCursorId: () => {},
      search: null,
      setSearch: () => {},
      mouseEnabled: false,
      toggleMouse: () => {},
      contentWidth: Math.min(CONTENT_MAX_WIDTH, width),
    }),
    [width],
  )

  return (
    <AppStateContext.Provider value={state}>
      <box flexDirection="column" width={width}>
        <NodeList nodes={nodes} />
      </box>
    </AppStateContext.Provider>
  )
}
