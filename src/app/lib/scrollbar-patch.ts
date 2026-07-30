type SliderLike = { viewPortSize: number }
type ScrollBarLike = {
  slider: SliderLike
  viewportSize: number
  scrollSize: number
  scrollPosition: number
}

/**
 * Anything carrying an OpenTUI vertical scrollbar. Structural rather than
 * `ScrollBoxRenderable`, so a test can drive a fake, and so both patches below
 * state exactly which accessors they touch.
 */
export type ScrollbarHost = { verticalScrollBar?: ScrollBarLike }

/**
 * HACK: OpenTUI has no public API for thumb-size override. We intercept the
 * scrollbar's `viewportSize`/`scrollSize` setters and, after each layout
 * update, set `slider.viewPortSize = viewport * scrollSize / realContent`,
 * where `realContent = scrollSize - tail` (the synthetic tail spacer added
 * by the Viewer so the last heading can scroll to the top of the viewport).
 * That keeps the thumb sized to viewport/realContent; scrolling into the
 * tail walks the thumb past the track bottom, where opentui clips it.
 */
export function installRealisticThumb(box: ScrollbarHost, tail: () => number): () => void {
  const sb = box.verticalScrollBar
  if (!sb) return () => {}
  const proto = Object.getPrototypeOf(sb)
  const vpDesc = Object.getOwnPropertyDescriptor(proto, 'viewportSize')
  const ssDesc = Object.getOwnPropertyDescriptor(proto, 'scrollSize')
  const vpGet = vpDesc?.get
  const vpSet = vpDesc?.set
  const ssGet = ssDesc?.get
  const ssSet = ssDesc?.set
  if (!vpGet || !vpSet || !ssGet || !ssSet) return () => {}

  const recompute = () => {
    const scrollSize = Number(ssGet.call(sb))
    const viewport = Number(vpGet.call(sb))
    const real = Math.max(1, scrollSize - tail())
    if (real <= viewport || scrollSize <= 0) {
      // Content fits: restore the natural (full-viewport) thumb size. OpenTUI's
      // native viewportSize setter does this itself, but a scrollSize-only shrink
      // (content getting shorter without a viewport resize) never touches
      // slider.viewPortSize, so a proportional shrink from recompute would stick.
      sb.slider.viewPortSize = Math.max(1, viewport)
      return
    }
    sb.slider.viewPortSize = Math.max(1, Math.round((viewport * scrollSize) / real))
  }

  Object.defineProperty(sb, 'viewportSize', {
    configurable: true,
    get: () => vpGet.call(sb),
    set: v => {
      vpSet.call(sb, v)
      recompute()
    },
  })
  Object.defineProperty(sb, 'scrollSize', {
    configurable: true,
    get: () => ssGet.call(sb),
    set: v => {
      ssSet.call(sb, v)
      recompute()
    },
  })
  recompute()

  return () => {
    // @ts-expect-error: removing the patched accessors so prototype getters/setters resume.
    delete sb.viewportSize
    // @ts-expect-error: same as above.
    delete sb.scrollSize
  }
}

/**
 * All vertical scroll paths (keyboard, wheel, scrollTo, scrollChildToTop)
 * funnel into `verticalScrollBar.scrollPosition`'s setter. Patch it so we
 * notify after every change: keyboard goes through dispatch's own sync, but
 * mouse wheel / drag mutate scrollTop directly and would otherwise leave the
 * sticky overlay stale.
 */
export function watchScroll(box: ScrollbarHost, notify: () => void): () => void {
  const sb = box.verticalScrollBar
  if (!sb) return () => {}
  const proto = Object.getPrototypeOf(sb)
  const desc = Object.getOwnPropertyDescriptor(proto, 'scrollPosition')
  const get = desc?.get
  const set = desc?.set
  if (!get || !set) return () => {}
  Object.defineProperty(sb, 'scrollPosition', {
    configurable: true,
    get: () => get.call(sb),
    set: v => {
      const prev = get.call(sb)
      set.call(sb, v)
      if (get.call(sb) !== prev) notify()
    },
  })
  return () => {
    // @ts-expect-error: restoring prototype lookup by deleting the override.
    delete sb.scrollPosition
  }
}
