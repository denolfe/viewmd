import { useMemo, useRef } from 'react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle } from './state'
import { NodeList } from './components/blocks/NodeRenderer'
import { Frontmatter } from './components/blocks/Frontmatter'
import { CONTENT_MAX_WIDTH } from './styles/layout'
import type { Node } from './lib/ast'
import type { FrontmatterRow } from './lib/frontmatter'

type Props = { nodes: Node[]; width: number; frontmatter?: FrontmatterRow[] }

export function RenderView({ nodes, width, frontmatter = [] }: Props) {
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
      tocVisible: true,
      toggleTocVisible: () => {},
      contentWidth: Math.min(CONTENT_MAX_WIDTH, width),
    }),
    [width],
  )

  return (
    <AppStateContext.Provider value={state}>
      <box flexDirection="column" width={width}>
        <Frontmatter rows={frontmatter} />
        <NodeList nodes={nodes} />
      </box>
    </AppStateContext.Provider>
  )
}
