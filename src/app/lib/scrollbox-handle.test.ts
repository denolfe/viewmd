import { describe, expect, mock, test } from 'bun:test'
import { createScrollboxHandle } from './scrollbox-handle'
import type { ScrollboxHandleDeps, ScrollboxLike } from './scrollbox-handle'
import type { BlockProjection } from './visible-text'
import type { Match } from './search'

/** Lets queueMicrotask'd effects (onRepositioned) run before assertions. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

type FakeBox = ScrollboxLike & { scrollHeight: number }

/**
 * Scrollbox fake. Clamps like the real box does, so a pin past the current
 * content height retries rather than silently landing. `verticalScrollBar` is
 * absent, so both scrollbar patches install as no-ops.
 */
function makeBox(
  opts: { children?: unknown[]; scrollHeight?: number; viewportHeight?: number } = {},
): FakeBox {
  const children = opts.children ?? []
  const box: FakeBox = {
    viewport: { y: 0, height: opts.viewportHeight ?? 10 },
    scrollTop: 0,
    scrollHeight: opts.scrollHeight ?? 100,
    scrollBy: delta => {
      box.scrollTop = clamp(box.scrollTop + delta, box)
    },
    scrollTo: y => {
      box.scrollTop = clamp(y, box)
    },
    content: {
      getChildren: () => children,
      findDescendantById: id => findById(children, id),
    },
  }
  return box
}

function clamp(y: number, box: FakeBox): number {
  return Math.max(0, Math.min(y, Math.max(0, box.scrollHeight - box.viewport.height)))
}

/** `undefined` for a miss, matching OpenTUI's own `findDescendantById`. */
function findById(children: unknown[], id: string): { y: number; height: number } | undefined {
  for (const child of children) {
    if (typeof child !== 'object' || child === null) continue
    if ('id' in child && child.id === id && 'y' in child && typeof child.y === 'number') {
      return { y: child.y, height: 'height' in child ? Number(child.height) : 1 }
    }
    if ('getChildren' in child && typeof child.getChildren === 'function') {
      const found = findById(child.getChildren(), id)
      if (found) return found
    }
  }
  return undefined
}

/** Heading-shaped renderable: an id and a y, no text. */
function heading(id: string, y: number): unknown {
  return { id, y, height: 1, getChildren: () => [] }
}

function makeDeps(
  box: FakeBox,
  over: Partial<Omit<ScrollboxHandleDeps, 'box'>> = {},
): ScrollboxHandleDeps {
  return {
    box,
    live: {
      tail: () => 0,
      projections: () => new Map(),
      isFullyMounted: () => false,
      contentWidth: () => 80,
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

describe('createScrollboxHandle getScrollMarks', () => {
  const projections = new Map<string, BlockProjection>([
    [
      'blk',
      {
        blockElementId: 'blk',
        blockPath: [0],
        runs: [{ key: 'r0', segments: [{ element: 0, text: 'hi', searchable: true }] }],
      },
    ],
  ])
  const matches: Match[] = [
    { blockPath: [0], blockElementId: 'blk', runKey: 'r0', start: 0, length: 1 },
  ]

  function makeMarkBox(): FakeBox {
    const bearer = {
      y: 5,
      plainText: 'hi',
      lineInfo: { lineStartCols: [0] },
      getChildren: () => [],
    }
    const blk = { id: 'blk', y: 5, height: 1, getChildren: () => [bearer] }
    return makeBox({ children: [blk], viewportHeight: 10, scrollHeight: 200 })
  }

  test('resolves marks once per reflow key', () => {
    const box = makeMarkBox()
    let width = 80
    const seam = createScrollboxHandle(
      makeDeps(box, {
        live: {
          tail: () => 3,
          projections: () => projections,
          isFullyMounted: () => true,
          contentWidth: () => width,
        },
      }),
    )
    const first = seam.handle.getScrollMarks({ matches })
    expect(first.marks).toEqual([{ y: 5, matchIndex: 0 }])
    expect(seam.handle.getScrollMarks({ matches }).marks).toBe(first.marks)

    width = 60
    expect(seam.handle.getScrollMarks({ matches }).marks).not.toBe(first.marks)
  })

  test('reports track scalars live, with the tail removed from the real content height', () => {
    const box = makeMarkBox()
    const seam = createScrollboxHandle(
      makeDeps(box, {
        live: {
          tail: () => 3,
          projections: () => projections,
          isFullyMounted: () => true,
          contentWidth: () => 80,
        },
      }),
    )
    box.scrollTop = 7
    const geo = seam.handle.getScrollMarks({ matches })
    expect(geo.scrollTop).toBe(7)
    expect(geo.scrollHeight).toBe(200)
    expect(geo.viewportHeight).toBe(10)
    expect(geo.realContentHeight).toBe(197)
  })
})
