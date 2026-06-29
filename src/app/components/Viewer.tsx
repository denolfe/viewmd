import { useEffect, useRef } from 'react'
import { useTerminalDimensions } from '@opentui/react'
import type { ScrollBoxRenderable } from '@opentui/core'
import { NodeList } from './blocks/NodeRenderer'
import { Frontmatter } from './blocks/Frontmatter'
import { resetMatchCounter } from './blocks/InlineRenderer'
import { CONTENT_MAX_WIDTH } from '../styles/layout'
import { useAppState } from '../state'
import { installRealisticThumb } from '../lib/scrollbar-thumb'
import type { ScrollboxHandle } from '../state'
import type { Node } from '../lib/ast'
import type { FrontmatterRow } from '../lib/frontmatter'

// Scrollbar (1) + inner paddingRight (1). Mirrors App.tsx VIEWER_OVERHEAD.
const VIEWER_OVERHEAD = 2

const PIN_TOP_OFFSET = 1

export function Viewer({
  nodes,
  frontmatter = [],
}: {
  nodes: Node[]
  frontmatter?: FrontmatterRow[]
}) {
  const { viewerRef, contentWidth } = useAppState()
  const { height } = useTerminalDimensions()
  const localRef = useRef<ScrollBoxRenderable | null>(null)
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
      getVisibleHeadingIds: ids => findVisibleHeadingIds(box, ids),
    }
    viewerRef.current = handle
    const restore = installRealisticThumb(box, tailRef)
    return () => {
      restore()
      viewerRef.current = null
    }
  }, [viewerRef])

  resetMatchCounter()
  return (
    <scrollbox
      ref={localRef}
      focusable={false}
      width={contentWidth + VIEWER_OVERHEAD}
      height="100%"
      overflow="hidden"
    >
      <box maxWidth={CONTENT_MAX_WIDTH} paddingRight={1} flexDirection="column">
        <Frontmatter rows={frontmatter} />
        <NodeList nodes={nodes} />
      </box>
      <box height={tailSpace} />
    </scrollbox>
  )
}

function scrollChildToTop(box: ScrollBoxRenderable, id: string): void {
  const child = box.content.findDescendantById(id)
  if (!child) return
  const delta = child.y - box.viewport.y - PIN_TOP_OFFSET
  if (delta !== 0) box.scrollBy(delta)
}

function findHeadingNearTop(box: ScrollBoxRenderable, ids: string[]): string | null {
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

function findVisibleHeadingIds(box: ScrollBoxRenderable, ids: string[]): Set<string> {
  const top = box.viewport.y
  const bottom = top + box.viewport.height
  const out = new Set<string>()
  for (const id of ids) {
    const child = box.content.findDescendantById(id)
    if (!child) continue
    const childTop = child.y
    const childBottom = child.y + child.height
    if (childBottom > top && childTop < bottom) out.add(id)
  }
  return out
}
