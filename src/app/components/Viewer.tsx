import { useEffect, useMemo, useRef, useState } from 'react'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import type { ScrollBoxRenderable } from '@opentui/core'
import { NodeList } from './blocks/NodeRenderer'
import { Frontmatter } from './blocks/Frontmatter'
import { ScrollIndicators } from './ScrollIndicators'
import { useAppState } from '../state'
import { installRealisticThumb } from '../lib/scrollbar-thumb'
import { matchJumpDelta, seedMatchIndex } from '../lib/match-nav'
import { CHUNK_SIZE, estimateTotalRows, initialMountCount } from '../lib/progressive'
import { alignOffset, projectionMap, runElementCount } from '../lib/visible-text'
import { theme } from '../styles/theme'
import type { BlockProjection } from '../lib/visible-text'
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
  docKey,
}: {
  nodes: Node[]
  frontmatter?: FrontmatterRow[]
  tailReserve?: number
  onScroll?: () => void
  /**
   * Stable identity of the current document (its path). Keying the content
   * subtree on it forces a full remount on navigation instead of reconciling:
   * two docs that share a heading slug (e.g. both start `# viewmd`) would
   * otherwise reuse the same heading renderable across the swap, leaving its
   * layout stale (NaN height, frozen y=0) so it hijacks the sticky breadcrumb.
   */
  docKey?: string
}) {
  const { viewerRef, contentWidth, contentMaxWidth } = useAppState()
  const renderer = useRenderer()
  const { height } = useTerminalDimensions()
  const localRef = useRef<ScrollBoxRenderable | null>(null)
  // Nothing sits below the viewport (the search bar and breadcrumb overlay
  // the viewer instead of consuming column rows). Tail = viewport - 1 so the
  // last heading can still
  // scroll to the top, minus `tailReserve` (the last heading's crumb height)
  // so its content stops just below the overlay rather than sliding up
  // behind it.
  const tailSpace = Math.max(0, height - 1 - tailReserve)
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

  // Ref'd so the once-mounted handle effect always reads the current map.
  const projections = useMemo(() => projectionMap(nodes), [nodes])
  const projectionsRef = useRef(projections)
  projectionsRef.current = projections

  const [mountedCount, setMountedCount] = useState(() =>
    initialMountCount({ nodes, contentWidth, viewportHeight: height }),
  )

  // Reset progressive mount when the document swaps (follow-link / go-back).
  // "Adjust state on prop change" during render — no stale frame, and the
  // Viewer instance (scroll handle, listeners, thumb override) is preserved.
  const prevNodes = useRef(nodes)
  if (prevNodes.current !== nodes) {
    prevNodes.current = nodes
    setMountedCount(initialMountCount({ nodes, contentWidth, viewportHeight: height }))
  }

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
      pinHeadingPostLayout: (id, topOffset) => {
        // Defer the pin to the post-layout `frame` retry. Right after a doc swap
        // the target box is committed but not yet laid out (reads y=0), so an
        // effect-time scroll would land at the top and — because the box *is*
        // found — falsely report success, leaving the reader stranded above the
        // anchor. onFrame runs it once geometry is real.
        pendingRef.current = { kind: 'heading', id, topOffset: topOffset ?? 0 }
      },
      getHeadingNearTop: (ids, topOffset) => findHeadingNearTop(box, ids, topOffset ?? 0),
      getVisibleHeadingIds: (ids, topOffset) => findVisibleHeadingIds(box, ids, topOffset ?? 0),
      getScrollMarks: ({ matches, activeIndex }) =>
        resolveScrollMarks(box, tailRef.current, projectionsRef.current, { matches, activeIndex }),
      seedMatchIndex: ({ matches, dir }) =>
        seedMatchIndex({
          matchYs: matches.map(m => resolveMatchY(box, m, projectionsRef.current)),
          viewportTop: box.viewport.y,
          dir,
        }),
      jumpToMatch: params => {
        const found = jumpToMatchNow(box, projectionsRef.current, params)
        pendingRef.current = found ? null : { kind: 'match', params }
      },
      subscribeScroll: cb => {
        scrollListeners.add(cb)
        return () => scrollListeners.delete(cb)
      },
      getScrollTop: () => box.scrollTop,
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
            : jumpToMatchNow(box, projectionsRef.current, pending.params)
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
  projections: Map<string, BlockProjection>,
  params: Parameters<ScrollboxHandle['jumpToMatch']>[0],
): boolean {
  const { match, topOffset } = params
  const y = resolveMatchY(box, match, projections)
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
  // `scrollChildToTop` pins a jumped/anchored heading PIN_TOP_OFFSET rows below
  // the overlay fold (a small gap so it isn't flush behind the crumbs). Allow the
  // same slack here so a freshly pinned heading resolves as current instead of its
  // predecessor — otherwise a post-nav re-resolve (e.g. the fully-mounted notify)
  // would snap the breadcrumb back to the previous sibling.
  const viewportTop = box.viewport.y + topOffset + PIN_TOP_OFFSET
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
 * blockquotes) render one text renderable per cell/paragraph; element-ordinal
 * indexing must span them all to land on the right one.
 */
export function collectTextBearers(
  node: { getChildren(): unknown[] },
  out: TextBearer[],
): TextBearer[] {
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

/**
 * Border/pipe-only text renderables (table rules, │ pipes) — not content
 * elements. Requires at least one rule glyph: purely-whitespace bearers are
 * content (an empty table cell in a wrapped row renders '\n') and must keep
 * their element slot.
 */
export function isRuleBearer(plainText: string): boolean {
  return /^[\s│┌┐└┘├┤┬┴┼─]+$/.test(plainText) && /[│┌┐└┘├┤┬┴┼─]/.test(plainText)
}

/**
 * Screen row of a match's first character: locate the run's target element
 * among the block's text bearers by element ordinal, then align the match's
 * projection offset into the bearer's rendered text.
 */
function resolveMatchY(
  box: ScrollBoxRenderable,
  match: Match,
  projections: Map<string, BlockProjection>,
): number | null {
  const blockBox = box.content.findDescendantById(match.blockElementId)
  if (!blockBox) return null
  const proj = projections.get(match.blockElementId)
  const run = proj?.runs.find(r => r.key === match.runKey)
  if (!proj || !run) return blockBox.y
  const bearers = collectTextBearers(blockBox, []).filter(b => !isRuleBearer(b.plainText))

  // Element ordinal of this run's first element among the block's content bearers.
  // Empty runs still mount an empty <text> bearer, so clamp each run to ≥1.
  let elementBase = 0
  for (const r of proj.runs) {
    if (r === run) break
    elementBase += Math.max(1, runElementCount(r))
  }
  // Find the segment containing match.start, then its offset within that
  // segment's element (segments of one element are contiguous in run order).
  let target: { element: number; offsetInElement: number } | null = null
  let pos = 0
  for (const s of run.segments) {
    if (match.start < pos + s.text.length) {
      let before = 0
      for (const t of run.segments) {
        if (t === s) break
        if (t.element === s.element) before += t.text.length
      }
      target = { element: s.element, offsetInElement: before + (match.start - pos) }
      break
    }
    pos += s.text.length
  }
  if (!target) return blockBox.y
  const found = target
  const targetText = run.segments
    .filter(s => s.element === found.element)
    .map(s => s.text)
    .join('')
  const bearer = bearers[elementBase + found.element]
  if (!bearer) return blockBox.y
  const aligned = alignOffset(targetText, bearer.plainText, found.offsetInElement)
  return bearer.y + visualLineForOffset(bearer.lineInfo.lineStartCols, aligned)
}

function resolveScrollMarks(
  box: ScrollBoxRenderable,
  tail: number,
  projections: Map<string, BlockProjection>,
  params: { matches: Match[]; activeIndex: number },
): {
  marks: ResolvedMark[]
  scrollTop: number
  scrollHeight: number
  viewportHeight: number
  realContentHeight: number
} {
  const { matches, activeIndex } = params
  const marks: ResolvedMark[] = []
  // Renderable `.y` is screen-absolute and includes the scroll translation
  // (content.translateY = -scrollTop). Convert to document space so marks stay
  // fixed on the track while scrolling: docY = screenY - viewportScreenY + scrollTop.
  const screenToDoc = box.scrollTop - box.viewport.y
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    if (!match) continue
    const y = resolveMatchY(box, match, projections)
    if (y === null) continue
    marks.push({ y: y + screenToDoc, kind: i === activeIndex ? 'activeMatch' : 'match' })
  }
  return {
    marks,
    scrollTop: box.scrollTop,
    scrollHeight: box.scrollHeight,
    viewportHeight: box.viewport.height,
    realContentHeight: box.scrollHeight - tail,
  }
}
