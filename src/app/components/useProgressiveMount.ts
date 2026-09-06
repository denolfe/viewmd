import { useMemo } from 'react'
import { estimateRowPrefix, initialMountCount } from '../lib/progressive'
import { useProgressiveCount } from './useProgressiveCount'
import type { Node } from '../lib/ast'

/**
 * Progressive-mount state for the Viewer: paints a viewport-sized prefix
 * immediately, then grows one chunk per task until the whole doc is mounted,
 * standing a spacer in for the not-yet-mounted tail so the scrollbar/G read
 * ~right.
 */
export function useProgressiveMount(params: {
  nodes: Node[]
  contentWidth: number
  viewportHeight: number
}): {
  mountedNodes: Node[]
  estimatedRemaining: number
  fullyMounted: boolean
} {
  const { nodes, contentWidth, viewportHeight } = params

  const mountedCount = useProgressiveCount({
    total: nodes.length,
    initial: () => initialMountCount({ nodes, contentWidth, viewportHeight }),
    resetKey: nodes,
  })
  const fullyMounted = mountedCount >= nodes.length

  // Memoized so the slice keeps its identity across shell re-renders (status
  // line, overlay, sidebar): NodeList is memo'd on it, and a fresh array per
  // render would re-reconcile every mounted block on every App render.
  const mountedNodes = useMemo(
    () => (fullyMounted ? nodes : nodes.slice(0, mountedCount)),
    [fullyMounted, nodes, mountedCount],
  )
  // Spacer stands in for unmounted content so scrollbar/G read ~right.
  const rowPrefix = useMemo(() => estimateRowPrefix(nodes, contentWidth), [nodes, contentWidth])
  const estimatedRemaining = fullyMounted
    ? 0
    : (rowPrefix[nodes.length] ?? 0) - (rowPrefix[mountedCount] ?? 0)

  return { mountedNodes, estimatedRemaining, fullyMounted }
}
