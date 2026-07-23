import { useMemo, useRef } from 'react'
import { AppStateContext } from './state'
import type { AppState, ScrollboxHandle } from './state'
import { NodeList } from './components/blocks/NodeRenderer'
import { Frontmatter } from './components/blocks/Frontmatter'
import { CONTENT_MAX_WIDTH } from './styles/layout'
import { createCommands } from './lib/commands'
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
  // AppState shape, wired to no-op setters.
  const commands = useMemo(
    () =>
      createCommands({
        viewerRef,
        doc: { nodes, toc: [], headingIds: [] },
        viewportHeight: 0,
        read: {
          currentHeadingId: null,
          visibleHeadingIds: new Set(),
          expanded: new Map(),
          tocCursorId: null,
          search: null,
          focus: 'viewer',
          tocVisible: true,
          historyDepth: 0,
        },
        set: {
          focus: () => {},
          currentHeadingId: () => {},
          visibleHeadingIds: () => {},
          tocCursorId: () => {},
          search: () => {},
          expanded: () => {},
          toggleMouse: () => {},
          toggleTocVisible: () => {},
          toggleExpanded: () => {},
        },
        onQuit: () => {},
        onOpenEditor: () => {},
        nav: { follow: () => {}, back: () => {} },
      }),
    [nodes],
  )

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
      contentWidth: Math.min(contentMaxWidth, width),
      contentMaxWidth,
      dir: undefined,
      followLink: () => {},
      goBack: () => {},
      historyDepth: 0,
      backLabel: undefined,
      status: { kind: 'idle' },
      setStatus: () => {},
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
