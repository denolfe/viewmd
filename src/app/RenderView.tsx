import { useMemo, useRef } from 'react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle } from './state'
import { NodeList } from './components/blocks/NodeRenderer'
import { Frontmatter } from './components/blocks/Frontmatter'
import { CONTENT_MAX_WIDTH } from './styles/layout'
import { createNoopCommands } from './lib/commands'
import type { Node } from './lib/ast'
import type { FrontmatterRow } from './lib/frontmatter'

type Props = {
  nodes: Node[]
  width: number
  frontmatter?: FrontmatterRow[]
  contentMaxWidth?: number
}

export function RenderView({
  nodes,
  width,
  frontmatter = [],
  contentMaxWidth = CONTENT_MAX_WIDTH,
}: Props) {
  const viewerRef = useRef<ScrollboxHandle | null>(null)

  // Static one-shot render has no interaction; commands exist only to satisfy the
  // AppState shape.
  const commands = useMemo(() => createNoopCommands(), [])

  const state = useMemo<AppState>(
    () => ({
      focus: 'viewer',
      currentHeadingId: null,
      visibleHeadingIds: new Set(),
      viewerRef,
      expanded: new Map(),
      tocCursorId: null,
      search: null,
      contentWidth: Math.min(contentMaxWidth, width),
      contentMaxWidth,
      dir: undefined,
      historyDepth: 0,
      backLabel: undefined,
      status: { kind: 'idle' },
      commands,
    }),
    [width, contentMaxWidth, commands],
  )

  return (
    <AppStateContext.Provider value={state}>
      <box flexDirection="column" width={state.contentWidth}>
        <Frontmatter rows={frontmatter} />
        <NodeList nodes={nodes} />
      </box>
    </AppStateContext.Provider>
  )
}
