import { useEffect, useMemo, useRef, useState } from 'react'
import { CHUNK_SIZE, estimateTotalRows, initialMountCount } from '../lib/progressive'
import type { Node } from '../lib/ast'

/**
 * Progressive-mount state machine: paints a viewport-sized prefix immediately,
 * then grows one chunk per task until the whole doc is mounted, standing a
 * spacer in for the not-yet-mounted tail so the scrollbar/G read ~right.
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

  const [mountedCount, setMountedCount] = useState(() =>
    initialMountCount({ nodes, contentWidth, viewportHeight }),
  )

  // Reset progressive mount when the document swaps (follow-link / go-back).
  // "Adjust state on prop change" during render — no stale frame, and the
  // Viewer instance (scroll handle, listeners, thumb override) is preserved.
  const prevNodes = useRef(nodes)
  if (prevNodes.current !== nodes) {
    prevNodes.current = nodes
    setMountedCount(initialMountCount({ nodes, contentWidth, viewportHeight }))
  }

  const fullyMounted = mountedCount >= nodes.length

  // Grow one chunk per task until the whole doc is mounted. setTimeout(0)
  // yields between commits so keyboard/scroll stay live during mount.
  useEffect(() => {
    if (fullyMounted) return
    const tid = setTimeout(() => {
      setMountedCount(c => Math.min(c + CHUNK_SIZE, nodes.length))
    }, 0)
    return () => clearTimeout(tid)
  }, [fullyMounted, mountedCount, nodes])

  const mountedNodes = fullyMounted ? nodes : nodes.slice(0, mountedCount)
  // Spacer stands in for unmounted content so scrollbar/G read ~right.
  const estimatedRemaining = useMemo(
    () => (fullyMounted ? 0 : estimateTotalRows(nodes.slice(mountedCount), contentWidth)),
    [fullyMounted, nodes, mountedCount, contentWidth],
  )

  return { mountedNodes, estimatedRemaining, fullyMounted }
}
