import { installRealisticThumb, watchScroll } from './scrollbar-patch'
import { createMarkCache } from './mark-cache'
import { seedMatchIndex } from './match-nav'
import { childToTopDelta } from './fold'
import { collectById, collectTextBearers } from './renderable-tree'
import {
  matchScrollDelta,
  resolveMatchYs,
  resolveScrollMarks,
  scrollTopDelta,
} from './viewport-geometry'
import { pendingReducer, IDLE } from './pending-reducer'
import type { ScrollbarHost } from './scrollbar-patch'
import type { BoxGeometry, ChildGeometry, TextBearer } from './viewport-geometry'
import type { PendingState, PendingTarget, PendingEffect, Resolution } from './pending-reducer'
import type { BlockProjection } from './visible-text'
import type { ScrollboxHandle } from '../state'

/**
 * The scrollbox surface this seam touches. Structural rather than
 * `ScrollBoxRenderable`, so tests can drive a fake without a renderer.
 */
export type ScrollboxLike = ScrollbarHost & {
  readonly viewport: { y: number; height: number }
  scrollTop: number
  readonly scrollHeight: number
  scrollBy(delta: number): void
  scrollTo(y: number): void
  readonly content: {
    getChildren(): unknown[]
    // OpenTUI returns `Renderable | undefined` here, not `| null`.
    findDescendantById(id: string): { y: number; height: number } | undefined
  }
}

export type ScrollboxHandleDeps = {
  box: ScrollboxLike
  /** Values that change after the handle is built. Read fresh per call, never captured. */
  live: {
    tail(): number
    projections(): Map<string, BlockProjection>
    isFullyMounted(): boolean
    contentWidth(): number
  }
  onScroll(): void
  onRepositioned(): void
}

export type ScrollboxSeam = {
  handle: ScrollboxHandle
  /** Run on the renderer's post-layout `frame` event: retries the pending target. */
  onFrame(): void
  /** Content finished mounting; notify scroll listeners on the next frame. */
  requestNotify(): void
  dispose(): void
}

/**
 * The imperative scroll seam: a `BoxGeometry` adapter over the scrollbox, the
 * pending-target retry protocol, and the `ScrollboxHandle` the command layer calls.
 * Built once per mounted scrollbox; everything that varies afterwards arrives
 * through `live`.
 */
export function createScrollboxHandle(deps: ScrollboxHandleDeps): ScrollboxSeam {
  const { box, live } = deps
  const geom = createBoxGeometry(box)
  const scrollListeners = new Set<() => void>()
  const marks = createMarkCache({
    resolve: matches => resolveScrollMarks({ geom, projections: live.projections(), matches }),
    // Marks are document-space, so only a rewrap or content growth can move one:
    // width rewraps, the real content height grows per mounted chunk, and the
    // fully-mounted flag catches a final chunk that lands on the same height.
    reflowKey: () =>
      `${live.contentWidth()}:${geom.viewportHeight}:${geom.scrollHeight - live.tail()}:${live.isFullyMounted()}`,
  })
  let state: PendingState = IDLE
  let needsNotify = false
  // True while engine-driven scroll effects are being applied, so the scroll watcher
  // can tell them from a user wheel/drag/keypress. Only the latter supersedes a pending.
  let isCompleting = false

  const notify = (): void => {
    deps.onScroll()
    for (const cb of scrollListeners) cb()
  }

  // Resolve a pending target against live geometry into a plain value the pure
  // reducer can act on. The only place delta fns are called.
  const resolve = (target: PendingTarget): Resolution => {
    if (target.kind === 'heading') {
      const delta = childToTopDelta(geom, target.id, target.topOffset)
      return delta === null ? null : { delta, reached: true }
    }
    if (target.kind === 'match') {
      const delta = matchScrollDelta(geom, live.projections(), target.params)
      return delta === null ? null : { delta, reached: true }
    }
    const delta = scrollTopDelta(geom, target.top)
    // Predict "reached" from the current scroll range instead of scrolling and
    // measuring: progressive mount may not have grown scrollHeight to fit `top`
    // yet, so the box would clamp short. Once it grows, this resolves true.
    const maxScroll = Math.max(0, geom.scrollHeight - geom.viewportHeight)
    return { delta, reached: Math.min(target.top, maxScroll) >= target.top - 1 }
  }

  // Scrolls run sync under `isCompleting`; repositioned defers, because committing
  // parent state inside OpenTUI's frame handler risks a re-entrant render.
  const applyEffects = (effects: PendingEffect[]): void => {
    isCompleting = true
    for (const effect of effects) {
      if (effect.kind === 'scrollBy' && effect.delta !== 0) box.scrollBy(effect.delta)
    }
    isCompleting = false
    for (const effect of effects) {
      if (effect.kind === 'repositioned') queueMicrotask(() => deps.onRepositioned())
    }
  }

  const send = (event: Parameters<typeof pendingReducer>[1]): void => {
    const reduced = pendingReducer(state, event)
    state = reduced.state
    applyEffects(reduced.effects)
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
    getScrollMarks: ({ matches }) => ({
      marks: marks.read(matches),
      scrollTop: geom.scrollTop,
      scrollHeight: geom.scrollHeight,
      viewportHeight: geom.viewportHeight,
      realContentHeight: geom.scrollHeight - live.tail(),
    }),
    seedMatchIndex: ({ matches }) =>
      seedMatchIndex({
        matchYs: resolveMatchYs(geom, matches, live.projections()),
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

  const restoreThumb = installRealisticThumb(box, live.tail)
  const restoreScroll = watchScroll(box, () => {
    // A scroll not driven by applyEffects means the user moved (wheel, drag and
    // keyboard bypass the reducer), and their navigation supersedes the pending.
    if (!isCompleting) send({ kind: 'userScroll' })
    notify()
  })

  return {
    handle,
    onFrame: () => {
      if (state.pending) {
        send({
          kind: 'frameTick',
          resolution: resolve(state.pending),
          fullyMounted: live.isFullyMounted(),
        })
      }
      if (needsNotify) {
        needsNotify = false
        notify()
      }
    },
    requestNotify: () => {
      needsNotify = true
    },
    dispose: () => {
      restoreScroll()
      restoreThumb()
      scrollListeners.clear()
      state = IDLE
    },
  }
}

/** `BoxGeometry` over a live scrollbox. Getters, so every read is post-layout current. */
function createBoxGeometry(box: ScrollboxLike): BoxGeometry {
  return {
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
    findChild: id => box.content.findDescendantById(id) ?? null,
    findChildren: ids =>
      collectById({
        root: box.content,
        wanted: new Set(ids),
        collect: (node): ChildGeometry => ({ y: node.y ?? 0, height: node.height ?? 0 }),
      }),
    collectTextBearers: id => {
      const el = findRenderable(box, id)
      return el ? collectTextBearers(el, []) : []
    },
    collectTextBearersFor: ids =>
      collectById({
        root: box.content,
        wanted: new Set(ids),
        collect: (node): TextBearer[] => collectTextBearers(node, []),
      }),
  }
}

/**
 * The renderable for `id`, walkable for text bearers. `findDescendantById` on the
 * structural port returns geometry only, so single-id bearer collection reuses the
 * batch walk with a one-element set.
 */
function findRenderable(box: ScrollboxLike, id: string): { getChildren(): unknown[] } | null {
  const found = collectById({
    root: box.content,
    wanted: new Set([id]),
    collect: node => node,
  })
  return found.get(id) ?? null
}
