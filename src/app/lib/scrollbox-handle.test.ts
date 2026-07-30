import { describe, expect, mock, test } from 'bun:test'
import { createScrollboxHandle } from './scrollbox-handle'
import type { ScrollboxHandleDeps, ScrollboxLike } from './scrollbox-handle'
import type { BlockProjection } from './visible-text'
import type { Match } from './search'

/** Lets queueMicrotask'd effects (onRepositioned) run before assertions. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

type FakeBox = ScrollboxLike & { scrollHeight: number; verticalScrollBar: FakeScrollBar }

/**
 * Stand-in for OpenTUI's ScrollBarRenderable: the patched members are prototype
 * accessors (class getters/setters), which is what both scrollbar patches look for
 * via `Object.getOwnPropertyDescriptor(proto, ...)`.
 */
class FakeScrollBar {
  slider = { viewPortSize: 0 }
  _scrollPosition = 0
  _viewportSize = 0
  _scrollSize = 0

  get scrollPosition() {
    return this._scrollPosition
  }
  set scrollPosition(value: number) {
    this._scrollPosition = value
  }

  get viewportSize() {
    return this._viewportSize
  }
  set viewportSize(value: number) {
    this._viewportSize = value
  }

  get scrollSize() {
    return this._scrollSize
  }
  set scrollSize(value: number) {
    this._scrollSize = value
  }
}

/**
 * Scrollbox fake. `scrollTop` reads through the scrollbar, as the real box does, so
 * writing `verticalScrollBar.scrollPosition` directly simulates a wheel/drag scroll.
 * Scrolls clamp, so a pin past the current content height retries rather than
 * silently landing.
 */
function makeBox(
  opts: {
    children?: unknown[]
    scrollHeight?: number
    viewportHeight?: number
    viewportTop?: number
  } = {},
): FakeBox {
  const children = opts.children ?? []
  const bar = new FakeScrollBar()
  const box: FakeBox = {
    verticalScrollBar: bar,
    viewport: { y: opts.viewportTop ?? 0, height: opts.viewportHeight ?? 10 },
    get scrollTop() {
      return bar.scrollPosition
    },
    scrollHeight: opts.scrollHeight ?? 100,
    scrollBy: delta => {
      box.scrollTo(box.scrollTop + delta)
    },
    scrollTo: y => {
      bar.scrollPosition = clamp(y, box)
    },
    content: {
      getChildren: () => children,
    },
  }
  return box
}

function clamp(y: number, box: FakeBox): number {
  return Math.max(0, Math.min(y, Math.max(0, box.scrollHeight - box.viewport.height)))
}

/** Heading-shaped renderable: an id and a y, no text. */
function heading(id: string, y: number): unknown {
  return { id, y, height: 1, getChildren: () => [] }
}

type LiveOverrides = Partial<ScrollboxHandleDeps['live']>

function makeDeps(
  box: FakeBox,
  over: { live?: LiveOverrides; onScroll?: () => void; onRepositioned?: () => void } = {},
): ScrollboxHandleDeps {
  return {
    box,
    live: {
      tail: () => 0,
      projections: () => new Map(),
      isFullyMounted: () => false,
      contentWidth: () => 80,
      mountedCount: () => 1,
      docKey: () => 'doc.md',
      ...over.live,
    },
    onScroll: over.onScroll ?? (() => {}),
    onRepositioned: over.onRepositioned ?? (() => {}),
  }
}

describe('createScrollboxHandle pending targets', () => {
  test('scrollChildToTop scrolls immediately for a mounted heading', () => {
    const box = makeBox({ children: [heading('h1', 30)], viewportHeight: 10, scrollHeight: 200 })
    const seam = createScrollboxHandle(makeDeps(box))
    seam.handle.scrollChildToTop('h1', 2)
    // y(30) - viewportTop(0) - PIN_TOP_OFFSET(1) - topOffset(2) = 27
    expect(box.scrollTop).toBe(27)
  })

  test('pinHeadingPostLayout waits for an unmounted heading, then pins it', async () => {
    const children: unknown[] = []
    const box = makeBox({ children, viewportHeight: 10, scrollHeight: 200 })
    const onRepositioned = mock()
    const seam = createScrollboxHandle(makeDeps(box, { onRepositioned }))

    seam.handle.pinHeadingPostLayout('h1', 0)
    seam.onFrame()
    expect(box.scrollTop).toBe(0)

    children.push(heading('h1', 50))
    seam.onFrame()
    await settle()
    // y(50) - viewportTop(0) - PIN_TOP_OFFSET(1) - topOffset(0) = 49
    expect(box.scrollTop).toBe(49)
    expect(onRepositioned).toHaveBeenCalledTimes(1)
  })

  test('pinScrollTop retries as content grows, then fires onRepositioned once', async () => {
    const box = makeBox({ viewportHeight: 10, scrollHeight: 20 })
    const onRepositioned = mock()
    const seam = createScrollboxHandle(makeDeps(box, { onRepositioned }))

    seam.handle.pinScrollTop(40)
    // maxScroll is 20 - 10 = 10, so the target is out of range and the box clamps short.
    seam.onFrame()
    expect(box.scrollTop).toBe(10)
    expect(onRepositioned).toHaveBeenCalledTimes(0)

    box.scrollHeight = 200
    seam.onFrame()
    await settle()
    expect(box.scrollTop).toBe(40)
    expect(onRepositioned).toHaveBeenCalledTimes(1)
  })

  test('dispose clears the pending so onFrame stops chasing it', () => {
    const box = makeBox({ viewportHeight: 10, scrollHeight: 20 })
    const seam = createScrollboxHandle(makeDeps(box))
    seam.handle.pinScrollTop(40)
    seam.dispose()
    box.scrollHeight = 200
    seam.onFrame()
    expect(box.scrollTop).toBe(0)
  })
})

describe('createScrollboxHandle scroll watching', () => {
  test('notifies on a scroll that moves, and not on a write of the same position', () => {
    const box = makeBox({ viewportHeight: 10, scrollHeight: 200 })
    const onScroll = mock()
    createScrollboxHandle(makeDeps(box, { onScroll }))

    box.verticalScrollBar.scrollPosition = 5
    expect(onScroll).toHaveBeenCalledTimes(1)
    box.verticalScrollBar.scrollPosition = 5
    expect(onScroll).toHaveBeenCalledTimes(1)
  })

  test('a user scroll supersedes a pending target', async () => {
    const box = makeBox({ viewportHeight: 10, scrollHeight: 20 })
    const onRepositioned = mock()
    const seam = createScrollboxHandle(makeDeps(box, { onRepositioned }))

    seam.handle.pinScrollTop(40)
    box.verticalScrollBar.scrollPosition = 5
    await settle()
    expect(onRepositioned).toHaveBeenCalledTimes(1)

    box.scrollHeight = 200
    seam.onFrame()
    expect(box.scrollTop).toBe(5)
  })

  test('an engine-driven scroll does not supersede a pending target', () => {
    const box = makeBox({ viewportHeight: 10, scrollHeight: 20 })
    const seam = createScrollboxHandle(makeDeps(box))

    // The retry clamps to 10, a real scroll that reaches the watcher.
    seam.handle.pinScrollTop(40)
    seam.onFrame()
    expect(box.scrollTop).toBe(10)

    box.scrollHeight = 200
    seam.onFrame()
    expect(box.scrollTop).toBe(40)
  })

  test('dispose restores the scrollPosition accessor', () => {
    const box = makeBox({ viewportHeight: 10, scrollHeight: 200 })
    const onScroll = mock()
    const seam = createScrollboxHandle(makeDeps(box, { onScroll }))

    seam.dispose()
    box.verticalScrollBar.scrollPosition = 5
    expect(box.scrollTop).toBe(5)
    expect(onScroll).toHaveBeenCalledTimes(0)
  })
})

describe('createScrollboxHandle notifications', () => {
  test('requestNotify delivers on the next frame, to onScroll and every listener', () => {
    const box = makeBox()
    const onScroll = mock()
    const seam = createScrollboxHandle(makeDeps(box, { onScroll }))
    const listener = mock()
    seam.handle.subscribeScroll(listener)

    seam.requestNotify()
    expect(onScroll).toHaveBeenCalledTimes(0)
    seam.onFrame()
    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)

    // One notify per request: an unrequested frame stays silent.
    seam.onFrame()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('unsubscribing stops delivery, and dispose clears the listeners', () => {
    const box = makeBox()
    const seam = createScrollboxHandle(makeDeps(box))
    const unsubscribed = mock()
    const kept = mock()
    const unsubscribe = seam.handle.subscribeScroll(unsubscribed)
    seam.handle.subscribeScroll(kept)

    unsubscribe()
    seam.requestNotify()
    seam.onFrame()
    expect(unsubscribed).toHaveBeenCalledTimes(0)
    expect(kept).toHaveBeenCalledTimes(1)

    seam.dispose()
    seam.requestNotify()
    seam.onFrame()
    expect(kept).toHaveBeenCalledTimes(1)
  })
})

describe('createScrollboxHandle match navigation', () => {
  const projections = new Map<string, BlockProjection>([
    projection('blk', 0),
    projection('blk2', 1),
  ])

  test('jumpToMatch leaves context rows above the match', () => {
    const box = makeMarkBox(30)
    const seam = createScrollboxHandle(makeDeps(box, { live: { projections: () => projections } }))
    const matches = [match('blk', [0])]
    seam.handle.jumpToMatch({ match: match('blk', [0]), matches, index: 0, topOffset: 2 })
    // y(30) - viewportTop(0) - topOffset(2) - JUMP_CONTEXT_ROWS(5) = 23
    expect(box.scrollTop).toBe(23)
  })

  test('seedMatchIndex picks the first match at or below the viewport top', () => {
    const box = makeBox({
      children: [markBlock('blk', 5), markBlock('blk2', 20)],
      viewportTop: 10,
      viewportHeight: 10,
      scrollHeight: 200,
    })
    const seam = createScrollboxHandle(makeDeps(box, { live: { projections: () => projections } }))
    const seeded = seam.handle.seedMatchIndex({ matches: [match('blk', [0]), match('blk2', [1])] })
    expect(seeded).toBe(1)
  })
})

describe('createScrollboxHandle getScrollMarks', () => {
  const projections = new Map<string, BlockProjection>([projection('blk', 0)])
  const matches: Match[] = [match('blk', [0])]

  function markDeps(box: FakeBox, live: LiveOverrides = {}): ScrollboxHandleDeps {
    return makeDeps(box, {
      live: {
        tail: () => 3,
        projections: () => projections,
        isFullyMounted: () => true,
        ...live,
      },
    })
  }

  test('resolves marks once per reflow key', () => {
    const box = makeMarkBox()
    let width = 80
    const seam = createScrollboxHandle(markDeps(box, { contentWidth: () => width }))

    const first = seam.handle.getScrollMarks({ matches })
    expect(first.marks).toEqual([{ y: 5, matchIndex: 0 }])
    expect(seam.handle.getScrollMarks({ matches }).marks).toBe(first.marks)

    width = 60
    expect(seam.handle.getScrollMarks({ matches }).marks).not.toBe(first.marks)
  })

  test('a newly mounted chunk invalidates the marks', () => {
    const box = makeMarkBox()
    let mounted = 1
    const seam = createScrollboxHandle(markDeps(box, { mountedCount: () => mounted }))

    const first = seam.handle.getScrollMarks({ matches })
    mounted = 33
    expect(seam.handle.getScrollMarks({ matches }).marks).not.toBe(first.marks)
  })

  test('scrolling alone does not invalidate the marks', () => {
    const box = makeMarkBox()
    const seam = createScrollboxHandle(markDeps(box))

    const first = seam.handle.getScrollMarks({ matches })
    box.scrollTo(7)
    expect(seam.handle.getScrollMarks({ matches }).marks).toBe(first.marks)
  })

  test('reports track scalars live, with the tail removed from the real content height', () => {
    const box = makeMarkBox()
    const seam = createScrollboxHandle(markDeps(box))

    box.scrollTo(7)
    const geo = seam.handle.getScrollMarks({ matches })
    expect(geo.scrollTop).toBe(7)
    expect(geo.scrollHeight).toBe(200)
    expect(geo.viewportHeight).toBe(10)
    expect(geo.realContentHeight).toBe(197)
  })
})

/** Single-block box whose one text bearer sits at `y`. */
function makeMarkBox(y = 5): FakeBox {
  return makeBox({ children: [markBlock('blk', y)], viewportHeight: 10, scrollHeight: 200 })
}

/** Block box wrapping one text bearer, both at `y`. */
function markBlock(id: string, y: number): unknown {
  const bearer = { y, plainText: 'hi', lineInfo: { lineStartCols: [0] }, getChildren: () => [] }
  return { id, y, height: 1, getChildren: () => [bearer] }
}

function projection(id: string, block: number): [string, BlockProjection] {
  return [
    id,
    {
      blockElementId: id,
      blockPath: [block],
      runs: [{ key: 'r0', segments: [{ element: 0, text: 'hi', searchable: true }] }],
    },
  ]
}

function match(id: string, blockPath: number[]): Match {
  return { blockPath, blockElementId: id, runKey: 'r0', start: 0, length: 1 }
}
