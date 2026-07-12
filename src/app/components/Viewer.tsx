import { useEffect, useMemo, useRef, useState } from 'react'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import type { ScrollBoxRenderable } from '@opentui/core'
import { NodeList } from './blocks/NodeRenderer'
import { Frontmatter } from './blocks/Frontmatter'
import { ScrollIndicators } from './ScrollIndicators'
import { CONTENT_MAX_WIDTH } from '../styles/layout'
import { useAppState } from '../state'
import { installRealisticThumb } from '../lib/scrollbar-thumb'
import { matchJumpDelta, seedMatchIndex } from '../lib/match-nav'
import { CHUNK_SIZE, estimateTotalRows, initialMountCount } from '../lib/progressive'
import { theme } from '../styles/theme'
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
  const renderer = useRenderer()
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
  const pendingRef = useRef<PendingTarget | null>(null)
  const notifyRef = useRef<() => void>(() => {})
  const needsNotifyRef = useRef(false)
  // True only while the frame retry itself scrolls, so watchScroll can tell a
  // retry's own scroll apart from wheel/drag (which must cancel the pending).
  const completingRef = useRef(false)

  const [mountedCount, setMountedCount] = useState(() =>
    initialMountCount({ nodes, contentWidth, viewportHeight: height }),
  )
  const fullyMounted = mountedCount >= nodes.length
  const fullyMountedRef = useRef(fullyMounted)
  fullyMountedRef.current = fullyMounted

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

  useEffect(() => {
    const box = localRef.current
    if (!box) return
    const scrollListeners = new Set<() => void>()
    // Any explicit navigation supersedes a jump still waiting on its chunk —
    // otherwise a stale pending target would yank the viewport later.
    const handle: ScrollboxHandle = {
      scrollBy: delta => {
        pendingRef.current = null
        box.scrollBy(delta)
      },
      scrollTo: y => {
        pendingRef.current = null
        box.scrollTo(y)
      },
      scrollToBottom: () => {
        pendingRef.current = null
        box.scrollTo(box.scrollHeight)
      },
      scrollChildToTop: (id, topOffset) => {
        const found = scrollChildToTop(box, id, topOffset ?? 0)
        pendingRef.current = found ? null : { kind: 'heading', id, topOffset: topOffset ?? 0 }
      },
      getHeadingNearTop: (ids, topOffset) => findHeadingNearTop(box, ids, topOffset ?? 0),
      getVisibleHeadingIds: (ids, topOffset) => findVisibleHeadingIds(box, ids, topOffset ?? 0),
      getScrollMarks: ({ matches, pattern, activeIndex }) =>
        resolveScrollMarks(box, tailRef.current, { matches, pattern, activeIndex }),
      seedMatchIndex: ({ matches, pattern, dir }) =>
        seedMatchIndex({
          matchYs: matches.map((m, i) => resolveMatchY(box, m, matches, i, pattern)),
          viewportTop: box.viewport.y,
          dir,
        }),
      jumpToMatch: params => {
        const found = jumpToMatchNow(box, params)
        pendingRef.current = found ? null : { kind: 'match', params }
      },
      subscribeScroll: cb => {
        scrollListeners.add(cb)
        return () => scrollListeners.delete(cb)
      },
    }
    viewerRef.current = handle
    const restore = installRealisticThumb(box, tailRef)
    notifyRef.current = () => {
      onScrollRef.current?.()
      for (const cb of scrollListeners) cb()
    }
    const restoreScroll = watchScroll(box, () => {
      // A scroll not initiated by the retry means the user moved (wheel/drag
      // bypass the handle) — their navigation supersedes the pending jump.
      if (!completingRef.current) pendingRef.current = null
      notifyRef.current()
    })
    // Retries run on the renderer's post-layout `frame` event, not in a React
    // effect: a just-committed chunk's renderables keep y=0 until the next
    // layout pass, so effect-time geometry would land the jump at the top.
    const onFrame = () => {
      const pending = pendingRef.current
      if (pending) {
        // Complete a jump that targeted content unmounted when it was issued.
        // A completed scroll also triggers watchScroll → notify, keeping the
        // breadcrumb in sync mid-mount.
        completingRef.current = true
        const done =
          pending.kind === 'heading'
            ? scrollChildToTop(box, pending.id, pending.topOffset)
            : jumpToMatchNow(box, pending.params)
        completingRef.current = false
        // Done, or unresolvable (the doc is fully mounted and the target still
        // isn't there) — either way no stale pending survives.
        if (done || fullyMountedRef.current) pendingRef.current = null
      }
      if (needsNotifyRef.current) {
        needsNotifyRef.current = false
        notifyRef.current()
      }
    }
    renderer.on('frame', onFrame)
    return () => {
      renderer.off('frame', onFrame)
      restoreScroll()
      restore()
      viewerRef.current = null
    }
  }, [viewerRef, renderer])

  // Refresh breadcrumb/marks once the whole doc is mounted — deferred to the
  // next frame so listeners read post-layout geometry.
  useEffect(() => {
    if (fullyMounted) needsNotifyRef.current = true
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
        <box maxWidth={CONTENT_MAX_WIDTH} paddingRight={1} flexDirection="column">
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

type PendingTarget =
  | { kind: 'heading'; id: string; topOffset: number }
  | { kind: 'match'; params: Parameters<ScrollboxHandle['jumpToMatch']>[0] }

/** Scrolls `id` to the viewport top. Returns false if `id` isn't mounted yet. */
function scrollChildToTop(box: ScrollBoxRenderable, id: string, topOffset: number): boolean {
  const child = box.content.findDescendantById(id)
  if (!child) return false
  const delta = child.y - box.viewport.y - PIN_TOP_OFFSET - topOffset
  if (delta !== 0) box.scrollBy(delta)
  return true
}

/** Jumps to a search match. Returns false if its block isn't mounted yet. */
function jumpToMatchNow(
  box: ScrollBoxRenderable,
  params: Parameters<ScrollboxHandle['jumpToMatch']>[0],
): boolean {
  const { match, matches, index, pattern, topOffset } = params
  if (!box.content.findDescendantById(match.blockElementId)) return false
  const y = resolveMatchY(box, match, matches, index, pattern)
  if (y === null) return false
  const delta = matchJumpDelta({
    matchY: y,
    viewportTop: box.viewport.y,
    topOffset: topOffset ?? 0,
  })
  if (delta !== 0) box.scrollBy(delta)
  return true
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

/**
 * All text-bearing descendants in tree order. Multi-text blocks (tables,
 * blockquotes) render one text renderable per cell/paragraph; occurrence
 * counting must span them all to land on the right one.
 */
function collectTextBearers(node: { getChildren(): unknown[] }, out: TextBearer[]): TextBearer[] {
  const self = asTextBearer(node)
  if (self) {
    out.push(self)
    return out
  }
  for (const child of node.getChildren()) {
    collectTextBearers(child as { getChildren(): unknown[] }, out)
  }
  return out
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
  const bearers = collectTextBearers(blockBox, [])
  if (bearers.length === 0) return blockBox.y
  // The match is the kth occurrence of the pattern within this block; walk the
  // block's text renderables in tree order (matching findMatches' AST order)
  // counting occurrences until the kth is reached.
  let k = 0
  for (let i = 0; i < matchIndex; i++) {
    if (matches[i]?.blockElementId === match.blockElementId) k++
  }
  const needle = pattern.toLowerCase()
  for (const bearer of bearers) {
    const hay = bearer.plainText.toLowerCase()
    let found = hay.indexOf(needle)
    while (found >= 0) {
      if (k === 0) return bearer.y + visualLineForOffset(bearer.lineInfo.lineStartCols, found)
      k--
      found = hay.indexOf(needle, found + Math.max(1, needle.length))
    }
  }
  return blockBox.y
}

function resolveScrollMarks(
  box: ScrollBoxRenderable,
  tail: number,
  params: { matches: Match[]; pattern: string; activeIndex: number },
): {
  marks: ResolvedMark[]
  scrollTop: number
  scrollHeight: number
  viewportHeight: number
  realContentHeight: number
} {
  const { matches, pattern, activeIndex } = params
  const marks: ResolvedMark[] = []
  // Renderable `.y` is screen-absolute and includes the scroll translation
  // (content.translateY = -scrollTop). Convert to document space so marks stay
  // fixed on the track while scrolling: docY = screenY - viewportScreenY + scrollTop.
  const screenToDoc = box.scrollTop - box.viewport.y
  if (pattern) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      if (!match) continue
      const y = resolveMatchY(box, match, matches, i, pattern)
      if (y === null) continue
      marks.push({ y: y + screenToDoc, kind: i === activeIndex ? 'activeMatch' : 'match' })
    }
  }
  return {
    marks,
    scrollTop: box.scrollTop,
    scrollHeight: box.scrollHeight,
    viewportHeight: box.viewport.height,
    realContentHeight: box.scrollHeight - tail,
  }
}
