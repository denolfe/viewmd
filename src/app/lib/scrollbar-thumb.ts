import type { ScrollBoxRenderable } from '@opentui/core'

type SliderLike = { viewPortSize: number }
type ScrollBarLike = {
  slider: SliderLike
  viewportSize: number
  scrollSize: number
}
type ScrollBoxWithBar = ScrollBoxRenderable & { verticalScrollBar?: ScrollBarLike }

/**
 * HACK: OpenTUI has no public API for thumb-size override. We intercept the
 * scrollbar's `viewportSize`/`scrollSize` setters and, after each layout
 * update, set `slider.viewPortSize = viewport * scrollSize / realContent`,
 * where `realContent = scrollSize - tail` (the synthetic tail spacer added
 * by the Viewer so the last heading can scroll to the top of the viewport).
 * That keeps the thumb sized to viewport/realContent; scrolling into the
 * tail walks the thumb past the track bottom, where opentui clips it.
 */
export function installRealisticThumb(
  box: ScrollBoxWithBar,
  tailRef: { current: number },
): () => void {
  const sb = box.verticalScrollBar
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
    // @ts-expect-error: removing the patched accessors so prototype getters/setters resume.
    delete sb.viewportSize
    // @ts-expect-error: same as above.
    delete sb.scrollSize
  }
}
