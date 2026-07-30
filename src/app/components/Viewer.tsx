import { useEffect, useMemo, useRef } from 'react'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import type { ScrollBoxRenderable } from '@opentui/core'
import { NodeList } from './blocks/NodeRenderer'
import { Frontmatter } from './blocks/Frontmatter'
import { ScrollIndicators } from './ScrollIndicators'
import { useProgressiveMount } from './useProgressiveMount'
import { useAppState } from '../state'
import { installRealisticThumb } from '../lib/scrollbar-thumb'
import { seedMatchIndex } from '../lib/match-nav'
import { projectionMap } from '../lib/visible-text'
import { childToTopDelta } from '../lib/fold'
import { collectById, collectTextBearers } from '../lib/renderable-tree'
import {
  matchScrollDelta,
  resolveMatchYs,
  resolveScrollMarks,
  scrollTopDelta,
} from '../lib/viewport-geometry'
import { pendingReducer, IDLE } from '../lib/pending-reducer'
import { theme } from '../styles/theme'
import { VIEWER_OVERHEAD } from '../styles/layout'
import type { BoxGeometry, ChildGeometry, TextBearer } from '../lib/viewport-geometry'
import type { PendingState, PendingTarget, PendingEffect, Resolution } from '../lib/pending-reducer'
import type { ScrollboxHandle } from '../state'
import type { Node } from '../lib/ast'
import type { FrontmatterRow } from '../lib/frontmatter'

export function Viewer({
  nodes,
  frontmatter = [],
  tailReserve = 0,
  onScroll,
  onRepositioned,
  docKey,
}: {
  nodes: Node[]
  frontmatter?: FrontmatterRow[]
  tailReserve?: number
  onScroll?: () => void
  /**
   * Fired (deferred) when a post-swap reposition (`pinScrollTop` /
   * `pinHeadingPostLayout`) settles — reached its target or the doc fully
   * mounted. Lets the shell drop the swap cover once the incoming doc is placed.
   */
  onRepositioned?: () => void
  /**
   * Stable identity of the current document (its path). Keying the content
   * subtree on it forces a full remount on navigation instead of reconciling:
   * two docs that share a heading slug (e.g. both start `# viewmd`) would
   * otherwise reuse the same heading renderable across the swap, leaving its
   * layout stale (NaN height, frozen y=0) so it hijacks the sticky overlay.
   */
  docKey?: string
}) {
  const { viewerRef, contentWidth, contentMaxWidth } = useAppState()
  const renderer = useRenderer()
  const { height } = useTerminalDimensions()
  const localRef = useRef<ScrollBoxRenderable | null>(null)
  // Nothing sits below the viewport (the search bar and sticky overlay
  // the viewer instead of consuming column rows). Tail = viewport - 1 so the
  // last heading can still
  // scroll to the top, minus `tailReserve` (the last heading's ancestor-stack height)
  // so its content stops just below the overlay rather than sliding up
  // behind it.
  const tailSpace = Math.max(0, height - 1 - tailReserve)
  const tailRef = useRef(tailSpace)
  tailRef.current = tailSpace
  const onScrollRef = useRef(onScroll)
  onScrollRef.current = onScroll
  const onRepositionedRef = useRef(onRepositioned)
  onRepositionedRef.current = onRepositioned
  const stateRef = useRef<PendingState>(IDLE)
  const notifyRef = useRef<() => void>(() => {})
  const needsNotifyRef = useRef(false)
  // True while the adapter is applying engine-driven scroll effects, so
  // watchScroll can tell an engine scroll apart from a user wheel/drag/keypress
  // (only the latter supersedes the pending jump).
  const completingRef = useRef(false)

  // Ref'd so the once-mounted handle effect always reads the current map.
  const projections = useMemo(() => projectionMap(nodes), [nodes])
  const projectionsRef = useRef(projections)
  projectionsRef.current = projections

  const { mountedNodes, estimatedRemaining, fullyMounted } = useProgressiveMount({
    nodes,
    contentWidth,
    viewportHeight: height,
  })
  const fullyMountedRef = useRef(fullyMounted)
  fullyMountedRef.current = fullyMounted

  useEffect(() => {
    const box = localRef.current
    if (!box) return
    const scrollListeners = new Set<() => void>()
    const geom: BoxGeometry = {
      get viewportTop() {
        return box.viewport.y
      },
      get viewportHeight() {
        return box.viewport.height
      },
      get scrollTop() {
        return box.scrollTop
      },
      get scrollHeight() {
        return box.scrollHeight
      },
      findChild: id => {
        const c = box.content.findDescendantById(id)
        return c ? { y: c.y, height: c.height } : null
      },
      findChildren: ids =>
        collectById({
          root: box.content,
          wanted: new Set(ids),
          collect: (node): ChildGeometry => ({ y: node.y ?? 0, height: node.height ?? 0 }),
        }),
      collectTextBearers: id => {
        const el = box.content.findDescendantById(id)
        return el ? collectTextBearers(el, []) : []
      },
      collectTextBearersFor: ids =>
        collectById({
          root: box.content,
          wanted: new Set(ids),
          collect: (node): TextBearer[] => collectTextBearers(node, []),
        }),
    }
    // Resolve a pending target against live geometry into a plain value the pure
    // reducer can act on. The only place delta fns are called.
    const resolve = (t: PendingTarget): Resolution => {
      if (t.kind === 'heading') {
        const d = childToTopDelta(geom, t.id, t.topOffset)
        return d === null ? null : { delta: d, reached: true }
      }
      if (t.kind === 'match') {
        const d = matchScrollDelta(geom, projectionsRef.current, t.params)
        return d === null ? null : { delta: d, reached: true }
      }
      const delta = scrollTopDelta(geom, t.top)
      // Predict "reached" from the current scroll range instead of scrolling and
      // measuring: progressive mount may not have grown scrollHeight to fit `top`
      // yet, so the box would clamp short. Once it grows, this resolves true.
      const maxScroll = Math.max(0, geom.scrollHeight - geom.viewportHeight)
      const reached = Math.min(t.top, maxScroll) >= t.top - 1
      return { delta, reached }
    }
    // Apply reducer effects: scrolls run sync under completingRef (so watchScroll
    // treats them as engine-driven, not user input); repositioned is deferred —
    // committing parent state inside OpenTUI's frame handler risks a re-entrant
    // render.
    const applyEffects = (effects: PendingEffect[]) => {
      completingRef.current = true
      for (const e of effects) if (e.kind === 'scrollBy' && e.delta !== 0) box.scrollBy(e.delta)
      completingRef.current = false
      for (const e of effects)
        if (e.kind === 'repositioned') queueMicrotask(() => onRepositionedRef.current?.())
    }
    const send = (event: Parameters<typeof pendingReducer>[1]) => {
      const { state, effects } = pendingReducer(stateRef.current, event)
      stateRef.current = state
      applyEffects(effects)
    }
    const handle: ScrollboxHandle = {
      scrollBy: delta => box.scrollBy(delta),
      scrollTo: y => box.scrollTo(y),
      scrollToBottom: () => box.scrollTo(box.scrollHeight),
      scrollChildToTop: (id, topOffset) => {
        const target: PendingTarget = { kind: 'heading', id, topOffset: topOffset ?? 0 }
        send({ kind: 'issueJump', target, resolution: resolve(target) })
      },
      pinHeadingPostLayout: (id, topOffset) => {
        send({ kind: 'pinJump', target: { kind: 'heading', id, topOffset: topOffset ?? 0 } })
      },
      pinScrollTop: top => {
        send({ kind: 'pinJump', target: { kind: 'scrollTop', top } })
      },
      getGeometry: () => geom,
      getScrollMarks: ({ matches }) =>
        resolveScrollMarks(geom, tailRef.current, projectionsRef.current, { matches }),
      getTrackGeometry: () => ({
        scrollTop: geom.scrollTop,
        scrollHeight: geom.scrollHeight,
        viewportHeight: geom.viewportHeight,
        realContentHeight: geom.scrollHeight - tailRef.current,
      }),
      seedMatchIndex: ({ matches }) =>
        seedMatchIndex({
          matchYs: resolveMatchYs(geom, matches, projectionsRef.current),
          viewportTop: geom.viewportTop,
        }),
      jumpToMatch: params => {
        const target: PendingTarget = { kind: 'match', params }
        send({ kind: 'issueJump', target, resolution: resolve(target) })
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
      // A scroll not driven by applyEffects means the user moved (wheel/drag/
      // keyboard bypass the reducer) — their navigation supersedes the pending.
      if (!completingRef.current) send({ kind: 'userScroll' })
      notifyRef.current()
    })
    // Retries run on the renderer's post-layout `frame` event, not in a React
    // effect: a just-committed chunk's renderables keep y=0 until the next
    // layout pass, so effect-time geometry would land the jump at the top.
    const onFrame = () => {
      if (stateRef.current.pending)
        send({
          kind: 'frameTick',
          resolution: resolve(stateRef.current.pending),
          fullyMounted: fullyMountedRef.current,
        })
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

  // Refresh headings/marks once the whole doc is mounted — deferred to the
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
 * sticky overlay stale.
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
