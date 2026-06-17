import { useEffect, useRef } from 'react'
import { useTerminalDimensions } from '@opentui/react'
import { NodeList } from './components/NodeRenderer'
import { useAppState } from './state'
import type { ScrollboxHandle } from './state'
import type { Node } from './ast'

export function Viewer({ nodes }: { nodes: Node[] }) {
  const { focus, viewerRef } = useAppState()
  const { height } = useTerminalDimensions()
  const localRef = useRef<any>(null)
  const tailSpace = Math.max(0, height - 4)

  useEffect(() => {
    const box = localRef.current
    if (!box) return
    const handle: ScrollboxHandle = {
      scrollBy: delta => box.scrollBy(delta),
      scrollTo: y => box.scrollTo(y),
      scrollToBottom: () => box.scrollTo(box.scrollHeight),
      scrollChildIntoView: id => box.scrollChildIntoView(id),
      scrollChildToTop: id => scrollChildToTop(box, id),
      getHeadingNearTop: ids => findHeadingNearTop(box, ids),
    }
    viewerRef.current = handle
    return () => {
      viewerRef.current = null
    }
  }, [viewerRef])

  return (
    <scrollbox ref={localRef} focused={focus === 'viewer'} flexGrow={1}>
      <box>
        <NodeList nodes={nodes} />
      </box>
      <box height={tailSpace} />
    </scrollbox>
  )
}

type ScrollBoxLike = {
  viewport: { y: number }
  content: { findDescendantById: (id: string) => { y: number } | undefined }
  scrollBy: (delta: number) => void
}

const PIN_TOP_OFFSET = 1

function scrollChildToTop(box: ScrollBoxLike, id: string): void {
  const child = box.content.findDescendantById(id)
  if (!child) return
  const delta = child.y - box.viewport.y - PIN_TOP_OFFSET
  if (delta !== 0) box.scrollBy(delta)
}

function findHeadingNearTop(box: ScrollBoxLike, ids: string[]): string | null {
  const viewportTop = box.viewport.y
  let bestId: string | null = null
  let bestY = -Infinity
  for (const id of ids) {
    const child = box.content.findDescendantById(id)
    if (!child) continue
    if (child.y <= viewportTop && child.y > bestY) {
      bestY = child.y
      bestId = id
    }
  }
  if (bestId) return bestId
  // No heading at or above viewport top — fall back to the first heading
  // below it so N then n still walks the doc sensibly.
  let firstBelowId: string | null = null
  let firstBelowY = Infinity
  for (const id of ids) {
    const child = box.content.findDescendantById(id)
    if (!child) continue
    if (child.y < firstBelowY) {
      firstBelowY = child.y
      firstBelowId = id
    }
  }
  return firstBelowId
}
