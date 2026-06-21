import { useEffect, useRef } from 'react'
import { useTerminalDimensions } from '@opentui/react'
import { NodeList } from './components/NodeRenderer'
import { CONTENT_MAX_WIDTH } from './layout'
import { useAppState } from './state'
import type { ScrollboxHandle } from './state'
import type { Node } from './ast'

export function Viewer({ nodes }: { nodes: Node[] }) {
  const { viewerRef } = useAppState()
  const { height } = useTerminalDimensions()
  const localRef = useRef<any>(null)
  const tailSpace = Math.max(0, height - 4)
  const tailRef = useRef(tailSpace)
  tailRef.current = tailSpace

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
    const restore = installRealisticThumb(box, tailRef)
    return () => {
      restore()
      viewerRef.current = null
    }
  }, [viewerRef])

  return (
    <scrollbox ref={localRef} focused={false} flexGrow={1}>
      <box maxWidth={CONTENT_MAX_WIDTH} paddingRight={1}>
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

/**
 * Make the scrollbar thumb size reflect the real content rather than
 * the inflated content (real + tail-space). We intercept the underlying
 * scrollbar's viewportSize/scrollSize setters and, after each layout
 * update, set slider.viewPortSize = viewport * scrollSize / realContent.
 * That keeps the thumb sized to viewport/realContent. Scrolling into the
 * tail walks the thumb past the track bottom, where opentui clips it.
 */
function installRealisticThumb(box: any, tailRef: { current: number }): () => void {
  const sb = box?.verticalScrollBar
  if (!sb) return () => {}
  const proto = Object.getPrototypeOf(sb)
  const vpDesc = Object.getOwnPropertyDescriptor(proto, 'viewportSize')
  const ssDesc = Object.getOwnPropertyDescriptor(proto, 'scrollSize')
  if (!vpDesc?.get || !vpDesc?.set || !ssDesc?.get || !ssDesc?.set) return () => {}

  const recompute = () => {
    const scrollSize = ssDesc.get!.call(sb) as number
    const viewport = vpDesc.get!.call(sb) as number
    const real = Math.max(1, scrollSize - tailRef.current)
    if (real <= viewport || scrollSize <= 0) return
    const desired = Math.max(1, Math.round((viewport * scrollSize) / real))
    sb.slider.viewPortSize = desired
  }

  Object.defineProperty(sb, 'viewportSize', {
    configurable: true,
    get: () => vpDesc.get!.call(sb),
    set: v => {
      vpDesc.set!.call(sb, v)
      recompute()
    },
  })
  Object.defineProperty(sb, 'scrollSize', {
    configurable: true,
    get: () => ssDesc.get!.call(sb),
    set: v => {
      ssDesc.set!.call(sb, v)
      recompute()
    },
  })
  recompute()

  return () => {
    delete sb.viewportSize
    delete sb.scrollSize
  }
}
