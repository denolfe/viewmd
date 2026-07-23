import { describe, expect, test, mock } from 'bun:test'
import { createCommands, createNoopCommands } from './commands'
import type { CommandDeps } from './commands'
import type { ScrollboxHandle } from '../state'
import type { TocEntry } from './ast'
import type { Match } from './search'
import type { RefObject } from 'react'

const m = (): Match => ({ blockPath: [0], blockElementId: 'x', runKey: 'x', start: 0, length: 1 })

// Viewer mock driven by absolute heading y-positions (viewport top = 0), so
// `topOffset` (the breadcrumb overlay height) actually changes what counts as
// "near top" / "visible" — the raw-position mock ignores it.
function makePositionalViewerRef(
  positions: Record<string, number>,
  viewportBottom = 20,
): { ref: RefObject<ScrollboxHandle | null> } {
  const handle: ScrollboxHandle = {
    scrollBy: () => {},
    scrollTo: () => {},
    scrollToBottom: () => {},
    scrollChildToTop: () => {},
    pinHeadingPostLayout: () => {},
    getHeadingNearTop: (ids, topOffset = 0) => {
      let best: string | null = null
      let bestY = -Infinity
      for (const id of ids) {
        const y = positions[id]
        if (y === undefined) continue
        if (y <= topOffset && y > bestY) {
          bestY = y
          best = id
        }
      }
      if (best) return best
      let firstBelow: string | null = null
      let firstBelowY = Infinity
      for (const id of ids) {
        const y = positions[id]
        if (y !== undefined && y < firstBelowY) {
          firstBelowY = y
          firstBelow = id
        }
      }
      return firstBelow
    },
    getVisibleHeadingIds: (ids, topOffset = 0) => {
      const out = new Set<string>()
      for (const id of ids) {
        const y = positions[id]
        if (y === undefined) continue
        if (y + 1 > topOffset && y < viewportBottom) out.add(id)
      }
      return out
    },
    getScrollMarks: () => ({
      marks: [],
      scrollTop: 0,
      scrollHeight: 0,
      viewportHeight: 0,
      realContentHeight: 0,
    }),
    jumpToMatch: () => {},
    seedMatchIndex: () => 0,
    subscribeScroll: () => () => {},
    getScrollTop: () => 0,
  }
  return { ref: { current: handle } }
}

const toc: TocEntry[] = [
  {
    id: 'a',
    level: 1,
    text: 'A',
    inline: [],
    children: [{ id: 'a1', level: 2, text: 'A1', inline: [], children: [] }],
  },
  { id: 'b', level: 1, text: 'B', inline: [], children: [] },
]
const headingIds = ['a', 'a1', 'b']

function makeDeps(
  overrides: {
    viewerRef?: RefObject<ScrollboxHandle | null>
    read?: Partial<CommandDeps['read']>
    doc?: Partial<CommandDeps['doc']>
  } = {},
): { deps: CommandDeps; set: CommandDeps['set'] } {
  const set: CommandDeps['set'] = {
    focus: mock(),
    currentHeadingId: mock(),
    visibleHeadingIds: mock(),
    tocCursorId: mock(),
    search: mock(),
    expanded: mock(),
    toggleMouse: mock(),
    toggleTocVisible: mock(),
    toggleExpanded: mock(),
  }
  const deps: CommandDeps = {
    viewerRef: overrides.viewerRef ?? makePositionalViewerRef({}).ref,
    doc: { nodes: [], toc, headingIds, ...overrides.doc },
    viewportHeight: 24,
    read: {
      currentHeadingId: null,
      visibleHeadingIds: new Set(),
      expanded: new Map(),
      tocCursorId: null,
      search: null,
      focus: 'viewer',
      tocVisible: true,
      historyDepth: 0,
      ...overrides.read,
    },
    set,
    onQuit: mock(),
    onOpenEditor: mock(),
    nav: { follow: mock(), back: mock() },
  }
  return { deps, set }
}

describe('createCommands.jumpToHeading', () => {
  test('runs the coupled pin → setCurrent → refreshVisible sequence', () => {
    const calls: string[] = []
    const built = makePositionalViewerRef({ a: 0, a1: 5, b: 40 })
    const handle = built.ref.current
    if (!handle) throw new Error('handle missing')
    const orig = handle.scrollChildToTop
    handle.scrollChildToTop = (id, off) => {
      calls.push(`pin(${id},${off ?? 0})`)
      orig(id, off)
    }
    const { deps, set } = makeDeps({ viewerRef: built.ref })
    createCommands(deps).jumpToHeading('a1')
    expect(calls.some(c => c.startsWith('pin(a1'))).toBe(true)
    expect(set.currentHeadingId).toHaveBeenCalledWith('a1')
    expect(set.visibleHeadingIds).toHaveBeenCalled()
    expect(set.focus).toHaveBeenCalledWith('viewer')
  })
})

describe('createCommands.jumpHeadingBy', () => {
  test('seeds from getHeadingNearTop when current is null, then advances', () => {
    const ref = makePositionalViewerRef({ a: -2, a1: 5, b: 40 }).ref
    const { deps, set } = makeDeps({ viewerRef: ref, read: { currentHeadingId: null } })
    createCommands(deps).jumpHeadingBy(1)
    expect(set.currentHeadingId).toHaveBeenCalledWith('a1')
  })
  test('walks headingIds from the current heading', () => {
    const { deps, set } = makeDeps({ read: { currentHeadingId: 'a1' } })
    createCommands(deps).jumpHeadingBy(1)
    expect(set.currentHeadingId).toHaveBeenCalledWith('b')
  })
})

describe('createCommands.syncFromScroll', () => {
  test('resolves current heading against the breadcrumb-overlay offset', () => {
    // a (H1) sits above the fold, a1 just below (row 1), b far down. The fixed
    // point resolves to `a`: near-top at offset 0 is `a`, and `a`'s own H1 crumb
    // is filtered out (offset 0), so the loop terminates on the first pass.
    const ref = makePositionalViewerRef({ a: -10, a1: 1, b: 40 }).ref
    const { deps, set } = makeDeps({ viewerRef: ref })
    createCommands(deps).syncFromScroll()
    expect(set.currentHeadingId).toHaveBeenCalledWith('a')
  })

  test('terminates via the seen-set bailout when the offset oscillates', () => {
    // a1 (offset 1) sits at row 0 and a (offset 0) at row 1: at offset 0 near-top
    // is a1 → offset 1; at offset 1 near-top is a → offset 0. The cycle would loop
    // forever without the `seen` guard; it must bail deterministically on `a`.
    const ref = makePositionalViewerRef({ a: 1, a1: 0, b: 40 }).ref
    const { deps, set } = makeDeps({ viewerRef: ref })
    createCommands(deps).syncFromScroll()
    expect(set.currentHeadingId).toHaveBeenCalledWith('a')
  })
})

describe('createCommands.jumpHeadingBy boundaries', () => {
  test('clamps at the last heading', () => {
    const { deps, set } = makeDeps({ read: { currentHeadingId: 'b' } })
    createCommands(deps).jumpHeadingBy(1)
    expect(set.currentHeadingId).toHaveBeenCalledWith('b')
  })
  test('clamps at the first heading', () => {
    const { deps, set } = makeDeps({ read: { currentHeadingId: 'a' } })
    createCommands(deps).jumpHeadingBy(-1)
    expect(set.currentHeadingId).toHaveBeenCalledWith('a')
  })
  test('backward from null with no viewport heading goes to last', () => {
    const ref = makePositionalViewerRef({}).ref
    const { deps, set } = makeDeps({ viewerRef: ref, read: { currentHeadingId: null } })
    createCommands(deps).jumpHeadingBy(-1)
    expect(set.currentHeadingId).toHaveBeenCalledWith('b')
  })
})

describe('createCommands.jumpToCursor', () => {
  test('jumps to the cursor and focuses viewer', () => {
    const { deps, set } = makeDeps({ read: { tocCursorId: 'a1' } })
    createCommands(deps).jumpToCursor()
    expect(set.currentHeadingId).toHaveBeenCalledWith('a1')
    expect(set.focus).toHaveBeenCalledWith('viewer')
  })
  test('no-op when there is no cursor', () => {
    const { deps, set } = makeDeps({ read: { tocCursorId: null } })
    createCommands(deps).jumpToCursor()
    expect(set.currentHeadingId).not.toHaveBeenCalled()
    expect(set.focus).not.toHaveBeenCalled()
  })
})

describe('createCommands.focusSidebar', () => {
  test('no-op when toc hidden', () => {
    const { deps, set } = makeDeps({ read: { tocVisible: false } })
    createCommands(deps).focusSidebar()
    expect(set.focus).not.toHaveBeenCalled()
  })
  test('no-op when toc empty', () => {
    const { deps, set } = makeDeps({ doc: { toc: [], headingIds: [] } })
    createCommands(deps).focusSidebar()
    expect(set.focus).not.toHaveBeenCalled()
  })
  test('seeds cursor to first entry and focuses sidebar', () => {
    const { deps, set } = makeDeps({ read: { tocCursorId: null, tocVisible: true } })
    createCommands(deps).focusSidebar()
    expect(set.tocCursorId).toHaveBeenCalledWith('a')
    expect(set.focus).toHaveBeenCalledWith('sidebar')
  })
  test('keeps an existing cursor', () => {
    const { deps, set } = makeDeps({ read: { tocCursorId: 'b' } })
    createCommands(deps).focusSidebar()
    expect(set.tocCursorId).not.toHaveBeenCalled()
    expect(set.focus).toHaveBeenCalledWith('sidebar')
  })
})

describe('createCommands.tocMove', () => {
  const expanded = new Map([['a', true]])
  test('advances cursor to the next visible entry', () => {
    const { deps, set } = makeDeps({ read: { tocCursorId: 'a', expanded } })
    createCommands(deps).tocMove(1)
    expect(set.tocCursorId).toHaveBeenCalledWith('a1')
  })
  test('moves cursor to the previous visible entry', () => {
    const { deps, set } = makeDeps({ read: { tocCursorId: 'a1', expanded } })
    createCommands(deps).tocMove(-1)
    expect(set.tocCursorId).toHaveBeenCalledWith('a')
  })
})

describe('createCommands.toggleTocVisible', () => {
  test('hiding from sidebar returns focus to viewer', () => {
    const { deps, set } = makeDeps({ read: { focus: 'sidebar', tocVisible: true } })
    createCommands(deps).toggleTocVisible()
    expect(set.focus).toHaveBeenCalledWith('viewer')
    expect(set.toggleTocVisible).toHaveBeenCalled()
  })
  test('toggling from viewer does not change focus', () => {
    const { deps, set } = makeDeps({ read: { focus: 'viewer' } })
    createCommands(deps).toggleTocVisible()
    expect(set.toggleTocVisible).toHaveBeenCalled()
    expect(set.focus).not.toHaveBeenCalled()
  })
})

describe('createCommands.toggleCursorExpanded', () => {
  test('toggles the cursor id', () => {
    const { deps, set } = makeDeps({ read: { tocCursorId: 'a' } })
    createCommands(deps).toggleCursorExpanded()
    expect(set.toggleExpanded).toHaveBeenCalledWith('a')
  })
  test('no-op when there is no cursor', () => {
    const { deps, set } = makeDeps({ read: { tocCursorId: null } })
    createCommands(deps).toggleCursorExpanded()
    expect(set.toggleExpanded).not.toHaveBeenCalled()
  })
})

describe('createCommands.clearSearch', () => {
  test('clears and returns to viewer when in search focus', () => {
    const { deps, set } = makeDeps({
      read: {
        focus: 'search',
        search: { pattern: 'x', matches: [], index: -1, dir: 'forward', committed: true },
      },
    })
    createCommands(deps).clearSearch()
    expect(set.search).toHaveBeenCalledWith(null)
    expect(set.focus).toHaveBeenCalledWith('viewer')
  })
  test('does not refocus when already in viewer', () => {
    const { deps, set } = makeDeps({
      read: {
        focus: 'viewer',
        search: { pattern: 'x', matches: [], index: -1, dir: 'forward', committed: true },
      },
    })
    createCommands(deps).clearSearch()
    expect(set.search).toHaveBeenCalledWith(null)
    expect(set.focus).not.toHaveBeenCalled()
  })
})

describe('createCommands.startSearch', () => {
  test('opens an empty uncommitted search and focuses the input', () => {
    const { deps, set } = makeDeps()
    createCommands(deps).startSearch('backward')
    expect(set.search).toHaveBeenCalledWith(
      expect.objectContaining({ dir: 'backward', committed: false, pattern: '' }),
    )
    expect(set.focus).toHaveBeenCalledWith('search')
  })
})

describe('createCommands.stepMatch', () => {
  test('wraps forward from the last match to the first', () => {
    const { deps, set } = makeDeps({
      read: {
        search: {
          pattern: 'x',
          matches: [m(), m(), m()],
          index: 2,
          dir: 'forward',
          committed: true,
        },
      },
    })
    createCommands(deps).stepMatch(1)
    expect(set.search).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }))
  })
  test('wraps backward from the first match to the last', () => {
    const { deps, set } = makeDeps({
      read: {
        search: {
          pattern: 'x',
          matches: [m(), m(), m()],
          index: 0,
          dir: 'forward',
          committed: true,
        },
      },
    })
    createCommands(deps).stepMatch(-1)
    expect(set.search).toHaveBeenCalledWith(expect.objectContaining({ index: 2 }))
  })
})

describe('createCommands.applySearchPattern', () => {
  test('sets matches + seeds index; commit moves focus to viewer', () => {
    const { deps, set } = makeDeps({
      read: { search: { pattern: '', matches: [], index: -1, dir: 'forward', committed: false } },
    })
    createCommands(deps).applySearchPattern({ pattern: 'x', commit: true })
    expect(set.search).toHaveBeenCalled()
    expect(set.focus).toHaveBeenCalledWith('viewer')
  })
  test('no-op when there is no active search', () => {
    const { deps, set } = makeDeps({ read: { search: null } })
    createCommands(deps).applySearchPattern({ pattern: 'x', commit: false })
    expect(set.search).not.toHaveBeenCalled()
  })
})

describe('createNoopCommands', () => {
  test('every method is a callable no-op that does not throw', () => {
    const c = createNoopCommands()
    // `never[]` params keep the call site typed without an `as` cast: every
    // Commands method is assignable to it, and each no-op ignores its args.
    const call = (fn: (...args: never[]) => unknown) => fn()
    expect(() => {
      for (const fn of Object.values(c)) call(fn)
    }).not.toThrow()
  })
})
