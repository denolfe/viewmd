import { describe, expect, test } from 'bun:test'
import { installRealisticThumb } from './scrollbar-thumb'

/**
 * Minimal stand-in for OpenTUI's ScrollBarRenderable prototype shape:
 * `viewportSize`/`scrollSize` are prototype accessors (matched via
 * `Object.getOwnPropertyDescriptor(proto, ...)` in installRealisticThumb),
 * and `slider.viewPortSize` is a plain field the accessors write to. This
 * mirrors the real OpenTUI behavior: `set viewportSize` writes
 * `slider.viewPortSize = viewport` itself, while `set scrollSize` never
 * touches `slider.viewPortSize` at all — so a scrollSize-only change (a
 * document swap with the terminal size unchanged) relies entirely on
 * `installRealisticThumb`'s own recompute to keep the thumb correct.
 */
class FakeScrollBar {
  slider = { viewPortSize: 0 }
  _viewportSize = 0
  _scrollSize = 0

  get viewportSize() {
    return this._viewportSize
  }
  set viewportSize(value: number) {
    this._viewportSize = value
    this.slider.viewPortSize = Math.max(1, value)
  }

  get scrollSize() {
    return this._scrollSize
  }
  set scrollSize(value: number) {
    this._scrollSize = value
  }
}

function makeBox(sb: FakeScrollBar) {
  return { verticalScrollBar: sb } as unknown as Parameters<typeof installRealisticThumb>[0]
}

describe('installRealisticThumb', () => {
  test('inflates the thumb to compensate for the tail spacer while content overflows', () => {
    const sb = new FakeScrollBar()
    const tailRef = { current: 20 }
    installRealisticThumb(makeBox(sb), tailRef)

    sb.viewportSize = 10
    sb.scrollSize = 100
    // real = scrollSize - tail = 80; desired = viewport * scrollSize / real
    expect(sb.slider.viewPortSize).toBe(Math.round((10 * 100) / 80))
  })

  test('restores the natural thumb size when a scrollSize-only shrink makes content fit', () => {
    const sb = new FakeScrollBar()
    const tailRef = { current: 20 }
    installRealisticThumb(makeBox(sb), tailRef)

    sb.viewportSize = 10
    sb.scrollSize = 100
    expect(sb.slider.viewPortSize).toBe(13) // inflated while overflowing (real=80 > viewport=10)

    // Swap to a short document: scrollSize shrinks so real <= viewport, but
    // viewportSize itself never changes, so OpenTUI's native setter never
    // gets a chance to reset slider.viewPortSize on its own.
    sb.scrollSize = 25
    expect(sb.slider.viewPortSize).toBe(10)
  })
})
