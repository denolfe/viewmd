import { useEffect, useRef } from 'react'
import { NodeList } from './components/NodeRenderer'
import { useAppState } from './state'
import type { ScrollboxHandle } from './state'
import type { Node } from './ast'

export function Viewer({ nodes }: { nodes: Node[] }) {
  const { focus, viewerRef } = useAppState()
  const localRef = useRef<any>(null)

  useEffect(() => {
    const box = localRef.current
    if (!box) return
    const handle: ScrollboxHandle = {
      scrollBy: delta => box.scrollBy(delta),
      scrollTo: y => box.scrollTo(y),
      scrollToBottom: () => box.scrollTo(box.scrollHeight),
      scrollChildIntoView: id => box.scrollChildIntoView(id),
      getHeadingNearTop: ids => findHeadingNearTop(box, ids),
    }
    viewerRef.current = handle
    return () => {
      viewerRef.current = null
    }
  }, [viewerRef])

  return (
    <scrollbox ref={localRef} focused={focus === 'viewer'} flexGrow={1}>
      <box paddingY={1}>
        <NodeList nodes={nodes} />
      </box>
    </scrollbox>
  )
}

type ScrollBoxLike = {
  viewport: { y: number }
  content: { findDescendantById: (id: string) => { y: number } | undefined }
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
