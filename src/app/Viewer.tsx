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
      scrollBy: (delta) => box.scrollBy(delta),
      scrollTo: (y) => box.scrollTo(y),
      scrollToBottom: () => box.scrollTo(box.scrollHeight),
      scrollChildIntoView: (id) => box.scrollChildIntoView(id),
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
