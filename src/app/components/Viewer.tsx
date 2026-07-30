import { useEffect, useMemo, useRef } from 'react'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import type { ScrollBoxRenderable } from '@opentui/core'
import { NodeList } from './blocks/NodeRenderer'
import { Frontmatter } from './blocks/Frontmatter'
import { ScrollIndicators } from './ScrollIndicators'
import { useProgressiveMount } from './useProgressiveMount'
import { useAppState } from '../state'
import { createScrollboxHandle } from '../lib/scrollbox-handle'
import { useLatest } from '../lib/useLatest'
import { projectionMap } from '../lib/visible-text'
import { theme } from '../styles/theme'
import { VIEWER_OVERHEAD } from '../styles/layout'
import type { ScrollboxSeam } from '../lib/scrollbox-handle'
import type { Node } from '../lib/ast'
import type { FrontmatterRow } from '../lib/frontmatter'

export function Viewer({
  nodes,
  frontmatter = [],
  tailReserve = 0,
  onScroll,
  onRepositioned,
  docKey,
}: {
  nodes: Node[]
  frontmatter?: FrontmatterRow[]
  tailReserve?: number
  onScroll?: () => void
  /**
   * Fired (deferred) when a post-swap reposition (`pinScrollTop` /
   * `pinHeadingPostLayout`) settles — reached its target or the doc fully
   * mounted. Lets the shell drop the swap cover once the incoming doc is placed.
   */
  onRepositioned?: () => void
  /**
   * Stable identity of the current document (its path). Keying the content
   * subtree on it forces a full remount on navigation instead of reconciling:
   * two docs that share a heading slug (e.g. both start `# viewmd`) would
   * otherwise reuse the same heading renderable across the swap, leaving its
   * layout stale (NaN height, frozen y=0) so it hijacks the sticky overlay.
   */
  docKey: string
}) {
  const { viewerRef, contentWidth, contentMaxWidth } = useAppState()
  const renderer = useRenderer()
  const { height } = useTerminalDimensions()
  const localRef = useRef<ScrollBoxRenderable | null>(null)
  const seamRef = useRef<ScrollboxSeam | null>(null)
  // Nothing sits below the viewport (the search bar and sticky overlay paint over
  // the viewer instead of consuming column rows), so tail = viewport - 1 lets the
  // last heading scroll to the top. `tailReserve` (that heading's ancestor-stack
  // height) comes off it so its content stops below the overlay, not behind it.
  const tailSpace = Math.max(0, height - 1 - tailReserve)
  const tailRef = useLatest(tailSpace)
  const onScrollRef = useLatest(onScroll)
  const onRepositionedRef = useLatest(onRepositioned)
  const contentWidthRef = useLatest(contentWidth)
  const docKeyRef = useLatest(docKey)

  // Ref'd so the once-mounted seam effect always reads the current map.
  const projectionsRef = useLatest(useMemo(() => projectionMap(nodes), [nodes]))

  const { mountedNodes, estimatedRemaining, fullyMounted } = useProgressiveMount({
    nodes,
    contentWidth,
    viewportHeight: height,
  })
  const fullyMountedRef = useLatest(fullyMounted)
  const mountedCountRef = useLatest(mountedNodes.length)

  useEffect(() => {
    const box = localRef.current
    if (!box) return
    const seam = createScrollboxHandle({
      box,
      live: {
        tail: () => tailRef.current,
        projections: () => projectionsRef.current,
        isFullyMounted: () => fullyMountedRef.current,
        contentWidth: () => contentWidthRef.current,
        mountedCount: () => mountedCountRef.current,
        docKey: () => docKeyRef.current,
      },
      onScroll: () => onScrollRef.current?.(),
      onRepositioned: () => onRepositionedRef.current?.(),
    })
    viewerRef.current = seam.handle
    seamRef.current = seam
    // Retries run on the renderer's post-layout `frame` event, not in a React
    // effect: a just-committed chunk's renderables keep y=0 until the next
    // layout pass, so effect-time geometry would land the jump at the top.
    renderer.on('frame', seam.onFrame)
    return () => {
      renderer.off('frame', seam.onFrame)
      seam.dispose()
      viewerRef.current = null
      seamRef.current = null
    }
  }, [viewerRef, renderer])

  // A doc that fits in its initial prefix never grows `mountedCount`, so the seam's
  // own reflow notify never fires for it. This delivers that first sync, on the next
  // frame so listeners read post-layout geometry.
  useEffect(() => {
    if (fullyMounted) seamRef.current?.requestNotify()
  }, [fullyMounted])

  return (
    <box position="relative" width={contentWidth + VIEWER_OVERHEAD} height="100%">
      <scrollbox
        ref={localRef}
        focusable={false}
        width="100%"
        height="100%"
        overflow="hidden"
        verticalScrollbarOptions={{
          trackOptions: {
            foregroundColor: theme.scrollbarThumb,
            backgroundColor: theme.scrollbarTrack,
          },
        }}
      >
        <box key={docKey} maxWidth={contentMaxWidth} paddingRight={1} flexDirection="column">
          <Frontmatter rows={frontmatter} />
          <NodeList nodes={mountedNodes} />
          {!fullyMounted && <box height={estimatedRemaining} />}
        </box>
        <box height={tailSpace} />
      </scrollbox>
      <ScrollIndicators />
    </box>
  )
}
