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
import type { Match } from '../lib/search'
import type { ResolvedMark } from '../lib/scroll-marks'

// Scrollbar (1) + inner paddingRight (1). Mirrors App.tsx VIEWER_OVERHEAD.
const VIEWER_OVERHEAD = 2

const PIN_TOP_OFFSET = 1

export function Viewer({
  nodes,
  frontmatter = [],
  tailReserve = 0,
  onScroll,
}: {
  nodes: Node[]
  frontmatter?: FrontmatterRow[]
  tailReserve?: number
  onScroll?: () => void
}) {
  const { viewerRef, contentWidth } = useAppState()
  const { height } = useTerminalDimensions()
  const localRef = useRef<ScrollBoxRenderable | null>(null)
  // Only the status line (1 row) sits below the viewport now — the breadcrumb
  // overlays the viewer instead of consuming column rows. Tail = viewport - 1
  // so the last heading can still scroll to the top, minus `tailReserve` (the
  // last heading's crumb height) so its content stops just below the overlay
  // rather than sliding up behind it.
  const tailSpace = Math.max(0, height - 2 - tailReserve)
  const tailRef = useRef(tailSpace)
  tailRef.current = tailSpace
  const onScrollRef = useRef(onScroll)
  onScrollRef.current = onScroll

  useEffect(() => {
    const box = localRef.current
    if (!box) return
    const handle: ScrollboxHandle = {
      scrollBy: delta => box.scrollBy(delta),
      scrollTo: y => box.scrollTo(y),
      scrollToBottom: () => box.scrollTo(box.scrollHeight),
      scrollChildToTop: (id, topOffset) => scrollChildToTop(box, id, topOffset ?? 0),
      getHeadingNearTop: (ids, topOffset) => findHeadingNearTop(box, ids, topOffset ?? 0),
      getVisibleHeadingIds: (ids, topOffset) => findVisibleHeadingIds(box, ids, topOffset ?? 0),
      getScrollMarks: ({ headingIds, matches, pattern, activeIndex }) =>
        resolveScrollMarks(box, tailRef.current, { headingIds, matches, pattern, activeIndex }),
    }
    viewerRef.current = handle
    const restore = installRealisticThumb(box, tailRef)
    const restoreScroll = watchScroll(box, () => onScrollRef.current?.())
    return () => {
      restoreScroll()
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

/**
 * All vertical scroll paths (keyboard, wheel, scrollTo, scrollChildToTop)
 * funnel into `verticalScrollBar.scrollPosition`'s setter. Patch it so we
 * notify after every change — keyboard goes through dispatch's own sync, but
 * mouse wheel / drag mutate scrollTop directly and would otherwise leave the
 * breadcrumb stale.
 */
function watchScroll(box: ScrollBoxRenderable, notify: () => void): () => void {
  const sb = box.verticalScrollBar as unknown as { scrollPosition: number }
  const proto = Object.getPrototypeOf(sb)
  const desc = Object.getOwnPropertyDescriptor(proto, 'scrollPosition')
  if (!desc?.get || !desc?.set) return () => {}
  Object.defineProperty(sb, 'scrollPosition', {
    configurable: true,
    get: () => desc.get!.call(sb),
    set: v => {
      const prev = desc.get!.call(sb)
      desc.set!.call(sb, v)
      if (desc.get!.call(sb) !== prev) notify()
    },
  })
  return () => {
    // @ts-expect-error: restoring prototype lookup by deleting the override.
    delete sb.scrollPosition
  }
}

function scrollChildToTop(box: ScrollBoxRenderable, id: string, topOffset: number): void {
  const child = box.content.findDescendantById(id)
  if (!child) return
  const delta = child.y - box.viewport.y - PIN_TOP_OFFSET - topOffset
  if (delta !== 0) box.scrollBy(delta)
}

function findHeadingNearTop(
  box: ScrollBoxRenderable,
  ids: string[],
  topOffset: number,
): string | null {
  const viewportTop = box.viewport.y + topOffset
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

function findVisibleHeadingIds(
  box: ScrollBoxRenderable,
  ids: string[],
  topOffset: number,
): Set<string> {
  const top = box.viewport.y + topOffset
  const bottom = box.viewport.y + box.viewport.height
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

/** Minimal structural view of the text-bearing renderable inside a block box. */
type TextBearer = { y: number; plainText: string; lineInfo: { lineStartCols: number[] } }

function asTextBearer(node: unknown): TextBearer | null {
  if (!node || typeof node !== 'object') return null
  if (!('plainText' in node) || !('lineInfo' in node) || !('y' in node)) return null
  const li = (node as { lineInfo: unknown }).lineInfo
  if (
    !li ||
    typeof li !== 'object' ||
    !Array.isArray((li as { lineStartCols?: unknown }).lineStartCols)
  )
    return null
  return node as unknown as TextBearer
}

/** Depth-first search for the first descendant exposing plainText + lineInfo. */
function findTextBearer(node: { getChildren(): unknown[] }): TextBearer | null {
  const self = asTextBearer(node)
  if (self) return self
  for (const child of node.getChildren()) {
    const found = findTextBearer(child as { getChildren(): unknown[] })
    if (found) return found
  }
  return null
}

/** Visual-line index for a character offset, via lineInfo.lineStartCols (cols ≈ chars). */
function visualLineForOffset(lineStartCols: number[], offset: number): number {
  let line = 0
  for (let i = 0; i < lineStartCols.length; i++) {
    if ((lineStartCols[i] ?? 0) <= offset) line = i
    else break
  }
  return line
}

function resolveMatchY(
  box: ScrollBoxRenderable,
  match: Match,
  matches: Match[],
  matchIndex: number,
  pattern: string,
): number | null {
  const blockBox = box.content.findDescendantById(match.blockElementId)
  if (!blockBox) return null
  const bearer = findTextBearer(blockBox)
  if (!bearer) return blockBox.y
  let k = 0
  for (let i = 0; i < matchIndex; i++) {
    if (matches[i]?.blockElementId === match.blockElementId) k++
  }
  const hay = bearer.plainText.toLowerCase()
  const needle = pattern.toLowerCase()
  let from = 0
  let found = -1
  for (let occ = 0; occ <= k; occ++) {
    found = hay.indexOf(needle, from)
    if (found < 0) break
    from = found + Math.max(1, needle.length)
  }
  if (found < 0) return blockBox.y
  return bearer.y + visualLineForOffset(bearer.lineInfo.lineStartCols, found)
}

function resolveScrollMarks(
  box: ScrollBoxRenderable,
  tail: number,
  params: { headingIds: string[]; matches: Match[]; pattern: string; activeIndex: number },
): { marks: ResolvedMark[]; contentHeight: number; trackHeight: number } {
  const { headingIds, matches, pattern, activeIndex } = params
  const marks: ResolvedMark[] = []
  for (const id of headingIds) {
    const child = box.content.findDescendantById(id)
    if (child) marks.push({ y: child.y, kind: 'heading' })
  }
  if (pattern) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      if (!match) continue
      const y = resolveMatchY(box, match, matches, i, pattern)
      if (y === null) continue
      marks.push({ y, kind: i === activeIndex ? 'activeMatch' : 'match' })
    }
  }
  return { marks, contentHeight: box.scrollHeight - tail, trackHeight: box.viewport.height }
}
