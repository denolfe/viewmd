import { describe, expect, test, mock } from 'bun:test'
import { createCommands, createNoopCommands } from './commands'
import { createFold } from './fold'
import type { CommandDeps } from './commands'
import type { ViewActions, ViewState } from './view-state'
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
): { ref: RefObject<ScrollboxHandle | null>; calls: string[] } {
  const calls: string[] = []
  const handle: ScrollboxHandle = {
    scrollBy: d => calls.push(`scrollBy(${d})`),
    scrollTo: y => calls.push(`scrollTo(${y})`),
    scrollToBottom: () => calls.push('scrollToBottom'),
    scrollChildToTop: (id, topOffset) => calls.push(`scrollChildToTop(${id},${topOffset ?? 0})`),
    pinHeadingPostLayout: (id, topOffset) =>
      calls.push(`pinHeadingPostLayout(${id},${topOffset ?? 0})`),
    pinScrollTop: top => calls.push(`pinScrollTop(${top})`),
    getGeometry: () => ({
      viewportTop: 0,
      viewportHeight: viewportBottom,
      scrollTop: 0,
      scrollHeight: 0,
      findChild: id => {
        const y = positions[id]
        return y === undefined ? null : { y, height: 1 }
      },
      collectTextBearers: () => [],
    }),
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
  return { ref: { current: handle }, calls }
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
    state?: Partial<ViewState>
    doc?: Partial<CommandDeps['doc']>
  } = {},
): { deps: CommandDeps; actions: ViewActions } {
  const actions: ViewActions = {
    focus: mock(),
    currentHeadingId: mock(),
    visibleHeadingIds: mock(),
    tocCursorId: mock(),
    search: mock(),
    setExpanded: mock(),
    toggleExpanded: mock(),
    toggleMouse: mock(),
    toggleTocVisible: mock(),
    toggleHelp: mock(),
  }
  const doc = { nodes: [], toc, headingIds, ...overrides.doc }
  const viewState: ViewState = {
    focus: 'viewer',
    currentHeadingId: null,
    visibleHeadingIds: new Set(),
    expanded: new Map(),
    tocCursorId: null,
    search: null,
    tocVisible: true,
    helpVisible: false,
    mouseEnabled: false,
    ...overrides.state,
  }
  const deps: CommandDeps = {
    viewerRef: overrides.viewerRef ?? makePositionalViewerRef({}).ref,
    doc,
    fold: createFold({ toc: doc.toc, fileLabel: doc.fileLabel }),
    viewportHeight: 24,
    stateRef: { current: viewState },
    actions,
    historyDepth: 0,
    onQuit: mock(),
    onOpenEditor: mock(),
    nav: { follow: mock(), back: mock(), backTo: mock() },
  }
  return { deps, actions }
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
    const { deps, actions } = makeDeps({ viewerRef: built.ref })
    createCommands(deps).jumpToHeading('a1')
    expect(calls.some(c => c.startsWith('pin(a1'))).toBe(true)
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a1')
    expect(actions.visibleHeadingIds).toHaveBeenCalled()
    expect(actions.focus).toHaveBeenCalledWith('viewer')
  })
})

describe('createCommands.jumpHeadingBy', () => {
  test('seeds from getHeadingNearTop when current is null, then advances', () => {
    const ref = makePositionalViewerRef({ a: -2, a1: 5, b: 40 }).ref
    const { deps, actions } = makeDeps({ viewerRef: ref, state: { currentHeadingId: null } })
    createCommands(deps).jumpHeadingBy(1)
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a1')
  })
  test('walks headingIds from the current heading', () => {
    const { deps, actions } = makeDeps({ state: { currentHeadingId: 'a1' } })
    createCommands(deps).jumpHeadingBy(1)
    expect(actions.currentHeadingId).toHaveBeenCalledWith('b')
  })
})

describe('createCommands.syncFromScroll', () => {
  test('resolves current heading against the breadcrumb-overlay offset', () => {
    // a (H1) sits above the fold, a1 below it (row 2, clear of the near-top
    // slack), b far down. The fixed point resolves to `a`: near-top at offset 0
    // is `a`, and `a`'s own H1 crumb is filtered out (offset 0), so the loop
    // terminates on the first pass.
    const ref = makePositionalViewerRef({ a: -10, a1: 2, b: 40 }).ref
    const { deps, actions } = makeDeps({ viewerRef: ref })
    createCommands(deps).syncFromScroll()
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a')
  })

  test('terminates via the seen-set bailout when the offset oscillates', () => {
    // a1 (offset 1) sits at row 0 and a (offset 0) at row 1: at offset 0 near-top
    // is a1 → offset 1; at offset 1 near-top is a → offset 0. The cycle would loop
    // forever without the `seen` guard; it must bail deterministically on `a`.
    const ref = makePositionalViewerRef({ a: 1, a1: 0, b: 40 }).ref
    const { deps, actions } = makeDeps({ viewerRef: ref })
    createCommands(deps).syncFromScroll()
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a')
  })
})

describe('createCommands.jumpHeadingBy boundaries', () => {
  test('clamps at the last heading', () => {
    const { deps, actions } = makeDeps({ state: { currentHeadingId: 'b' } })
    createCommands(deps).jumpHeadingBy(1)
    expect(actions.currentHeadingId).toHaveBeenCalledWith('b')
  })
  test('clamps at the first heading', () => {
    const { deps, actions } = makeDeps({ state: { currentHeadingId: 'a' } })
    createCommands(deps).jumpHeadingBy(-1)
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a')
  })
  test('backward from null with no viewport heading goes to last', () => {
    const ref = makePositionalViewerRef({}).ref
    const { deps, actions } = makeDeps({ viewerRef: ref, state: { currentHeadingId: null } })
    createCommands(deps).jumpHeadingBy(-1)
    expect(actions.currentHeadingId).toHaveBeenCalledWith('b')
  })
})

describe('createCommands.jumpToCursor', () => {
  test('jumps to the cursor and focuses viewer', () => {
    const { deps, actions } = makeDeps({ state: { tocCursorId: 'a1' } })
    createCommands(deps).jumpToCursor()
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a1')
    expect(actions.focus).toHaveBeenCalledWith('viewer')
  })
  test('no-op when there is no cursor', () => {
    const { deps, actions } = makeDeps({ state: { tocCursorId: null } })
    createCommands(deps).jumpToCursor()
    expect(actions.currentHeadingId).not.toHaveBeenCalled()
    expect(actions.focus).not.toHaveBeenCalled()
  })
})

describe('createCommands.focusSidebar', () => {
  test('no-op when toc hidden', () => {
    const { deps, actions } = makeDeps({ state: { tocVisible: false } })
    createCommands(deps).focusSidebar()
    expect(actions.focus).not.toHaveBeenCalled()
  })
  test('no-op when toc empty', () => {
    const { deps, actions } = makeDeps({ doc: { toc: [], headingIds: [] } })
    createCommands(deps).focusSidebar()
    expect(actions.focus).not.toHaveBeenCalled()
  })
  test('seeds cursor to first entry and focuses sidebar', () => {
    const { deps, actions } = makeDeps({ state: { tocCursorId: null, tocVisible: true } })
    createCommands(deps).focusSidebar()
    expect(actions.tocCursorId).toHaveBeenCalledWith('a')
    expect(actions.focus).toHaveBeenCalledWith('sidebar')
  })
  test('keeps an existing cursor', () => {
    const { deps, actions } = makeDeps({ state: { tocCursorId: 'b' } })
    createCommands(deps).focusSidebar()
    expect(actions.tocCursorId).not.toHaveBeenCalled()
    expect(actions.focus).toHaveBeenCalledWith('sidebar')
  })
})

describe('createCommands.tocMove', () => {
  const expanded = new Map([['a', true]])
  test('advances cursor to the next visible entry', () => {
    const { deps, actions } = makeDeps({ state: { tocCursorId: 'a', expanded } })
    createCommands(deps).tocMove(1)
    expect(actions.tocCursorId).toHaveBeenCalledWith('a1')
  })
  test('moves cursor to the previous visible entry', () => {
    const { deps, actions } = makeDeps({ state: { tocCursorId: 'a1', expanded } })
    createCommands(deps).tocMove(-1)
    expect(actions.tocCursorId).toHaveBeenCalledWith('a')
  })
})

describe('createCommands.toggleTocVisible', () => {
  test('hiding from sidebar returns focus to viewer', () => {
    const { deps, actions } = makeDeps({ state: { focus: 'sidebar', tocVisible: true } })
    createCommands(deps).toggleTocVisible()
    expect(actions.focus).toHaveBeenCalledWith('viewer')
    expect(actions.toggleTocVisible).toHaveBeenCalled()
  })
  test('toggling from viewer does not change focus', () => {
    const { deps, actions } = makeDeps({ state: { focus: 'viewer' } })
    createCommands(deps).toggleTocVisible()
    expect(actions.toggleTocVisible).toHaveBeenCalled()
    expect(actions.focus).not.toHaveBeenCalled()
  })
})

describe('createCommands.toggleCursorExpanded', () => {
  test('toggles the cursor id', () => {
    const { deps, actions } = makeDeps({ state: { tocCursorId: 'a' } })
    createCommands(deps).toggleCursorExpanded()
    expect(actions.toggleExpanded).toHaveBeenCalledWith({ toc, id: 'a' })
  })
  test('no-op when there is no cursor', () => {
    const { deps, actions } = makeDeps({ state: { tocCursorId: null } })
    createCommands(deps).toggleCursorExpanded()
    expect(actions.toggleExpanded).not.toHaveBeenCalled()
  })
})

describe('createCommands.clearSearch', () => {
  test('clears and returns to viewer when in search focus', () => {
    const { deps, actions } = makeDeps({
      state: {
        focus: 'search',
        search: { pattern: 'x', matches: [], index: -1, committed: true },
      },
    })
    createCommands(deps).clearSearch()
    expect(actions.search).toHaveBeenCalledWith(null)
    expect(actions.focus).toHaveBeenCalledWith('viewer')
  })
  test('does not refocus when already in viewer', () => {
    const { deps, actions } = makeDeps({
      state: {
        focus: 'viewer',
        search: { pattern: 'x', matches: [], index: -1, committed: true },
      },
    })
    createCommands(deps).clearSearch()
    expect(actions.search).toHaveBeenCalledWith(null)
    expect(actions.focus).not.toHaveBeenCalled()
  })
})

describe('createCommands.startSearch', () => {
  test('opens an empty uncommitted search and focuses the input', () => {
    const { deps, actions } = makeDeps()
    createCommands(deps).startSearch()
    expect(actions.search).toHaveBeenCalledWith(
      expect.objectContaining({ committed: false, pattern: '', index: -1 }),
    )
    expect(actions.focus).toHaveBeenCalledWith('search')
  })
})

describe('createCommands.stepMatch', () => {
  test('wraps forward from the last match to the first', () => {
    const { deps, actions } = makeDeps({
      state: {
        search: {
          pattern: 'x',
          matches: [m(), m(), m()],
          index: 2,
          committed: true,
        },
      },
    })
    createCommands(deps).stepMatch(1)
    expect(actions.search).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }))
  })
  test('wraps backward from the first match to the last', () => {
    const { deps, actions } = makeDeps({
      state: {
        search: {
          pattern: 'x',
          matches: [m(), m(), m()],
          index: 0,
          committed: true,
        },
      },
    })
    createCommands(deps).stepMatch(-1)
    expect(actions.search).toHaveBeenCalledWith(expect.objectContaining({ index: 2 }))
  })
})

describe('createCommands.applySearchPattern', () => {
  test('sets matches + seeds index; commit moves focus to viewer', () => {
    const { deps, actions } = makeDeps({
      state: { search: { pattern: '', matches: [], index: -1, committed: false } },
    })
    createCommands(deps).applySearchPattern({ pattern: 'x', commit: true })
    expect(actions.search).toHaveBeenCalled()
    expect(actions.focus).toHaveBeenCalledWith('viewer')
  })
  test('no-op when there is no active search', () => {
    const { deps, actions } = makeDeps({ state: { search: null } })
    createCommands(deps).applySearchPattern({ pattern: 'x', commit: false })
    expect(actions.search).not.toHaveBeenCalled()
  })
})

const siblingToc: TocEntry[] = [
  {
    id: 'h1',
    level: 1,
    text: 'H1',
    inline: [],
    children: [
      { id: 'sa', level: 2, text: 'SA', inline: [], children: [] },
      { id: 'sb', level: 2, text: 'SB', inline: [], children: [] },
    ],
  },
]
const siblingIds = ['h1', 'sa', 'sb']

describe('createCommands.syncFromScroll sibling handoff (blip fix)', () => {
  test('previous section stays current while a blank line (not the new header) is at the fold', () => {
    // sa scrolled above; sb still sits below the fold plus the near-top slack
    // (row 3). The handoff must NOT fire early — current resolves to sa.
    const ref = makePositionalViewerRef({ h1: -100, sa: -5, sb: 3 }).ref
    const { deps, actions } = makeDeps({
      viewerRef: ref,
      doc: { toc: siblingToc, headingIds: siblingIds },
      state: { currentHeadingId: null },
    })
    createCommands(deps).syncFromScroll()
    expect(actions.currentHeadingId).toHaveBeenCalledWith('sa')
    expect(actions.currentHeadingId).not.toHaveBeenCalledWith('sb')
  })

  test('handoff fires exactly when the new header reaches the fold', () => {
    // sb now at the fold (row 1, = ancestor-stack height of 1). Current flips to sb.
    const ref = makePositionalViewerRef({ h1: -100, sa: -5, sb: 1 }).ref
    const { deps, actions } = makeDeps({
      viewerRef: ref,
      doc: { toc: siblingToc, headingIds: siblingIds },
      state: { currentHeadingId: 'sa' },
    })
    createCommands(deps).syncFromScroll()
    expect(actions.currentHeadingId).toHaveBeenCalledWith('sb')
  })
})

describe('createCommands.syncFromScroll breadcrumb-overlay offset', () => {
  test('a heading behind the overlay becomes current and is excluded from visible', () => {
    // a (H1) is scrolled off above; a1 (H2 under a) sits at row 0, behind the
    // breadcrumb overlay; b is far below the fold. Without offset resolution a1
    // would count as "visible" (filtered from the breadcrumb) yet be hidden
    // behind the overlay — it would vanish. The fixed point must instead make a1
    // current and exclude it from the visible set so it shows as a crumb.
    const ref = makePositionalViewerRef({ a: -3, a1: 0, b: 50 }).ref
    const { deps, actions } = makeDeps({
      viewerRef: ref,
      state: { currentHeadingId: null, visibleHeadingIds: new Set(['a1']) },
    })
    createCommands(deps).syncFromScroll()
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a1')
    const lastVisible = (actions.visibleHeadingIds as ReturnType<typeof mock>).mock.calls.at(
      -1,
    )?.[0]
    expect(lastVisible?.has('a1')).toBe(false)
  })
})

describe('createCommands.jumpHeadingBy frontmatter boundary', () => {
  const fmIds = ['\x00frontmatter', 'a', 'a1', 'b']

  test('prev from the first real heading stops on the frontmatter id', () => {
    const { deps, actions } = makeDeps({
      doc: { headingIds: fmIds },
      state: { currentHeadingId: 'a' },
    })
    createCommands(deps).jumpHeadingBy(-1)
    expect(actions.currentHeadingId).toHaveBeenCalledWith('\x00frontmatter')
  })

  test('next leaves the frontmatter for the first real heading', () => {
    const { deps, actions } = makeDeps({
      doc: { headingIds: fmIds },
      state: { currentHeadingId: '\x00frontmatter' },
    })
    createCommands(deps).jumpHeadingBy(1)
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a')
  })
})

describe('createCommands.scrollPage / scrollHalf', () => {
  test('scrollPage scrolls by a full page (viewportHeight - 2)', () => {
    const built = makePositionalViewerRef({})
    const { deps } = makeDeps({ viewerRef: built.ref })
    createCommands(deps).scrollPage(1)
    expect(built.calls).toContain('scrollBy(22)')
  })

  test('scrollHalf scrolls by half a page (floor((viewportHeight - 2) / 2))', () => {
    const built = makePositionalViewerRef({})
    const { deps } = makeDeps({ viewerRef: built.ref })
    createCommands(deps).scrollHalf(1)
    expect(built.calls).toContain('scrollBy(11)')
  })
})

describe('createCommands.resetForNewDoc', () => {
  test('full reset clears every per-doc slice', () => {
    const { deps, actions } = makeDeps()
    createCommands(deps).resetForNewDoc('full')
    expect(actions.focus).toHaveBeenCalledWith('viewer')
    expect(actions.currentHeadingId).toHaveBeenCalledWith(null)
    expect(actions.search).toHaveBeenCalledWith(null)
    expect(actions.tocCursorId).toHaveBeenCalledWith(null)
    const expandedArg = (actions.setExpanded as ReturnType<typeof mock>).mock.calls.at(-1)?.[0]
    expect(expandedArg).toBeInstanceOf(Map)
    expect(expandedArg?.size).toBe(0)
    const visibleArg = (actions.visibleHeadingIds as ReturnType<typeof mock>).mock.calls.at(-1)?.[0]
    expect(visibleArg).toBeInstanceOf(Set)
    expect(visibleArg?.size).toBe(0)
  })

  test('searchOnly reset clears only the search slice', () => {
    const { deps, actions } = makeDeps()
    createCommands(deps).resetForNewDoc('searchOnly')
    expect(actions.search).toHaveBeenCalledWith(null)
    expect(actions.focus).not.toHaveBeenCalled()
    expect(actions.currentHeadingId).not.toHaveBeenCalled()
    expect(actions.tocCursorId).not.toHaveBeenCalled()
    expect(actions.setExpanded).not.toHaveBeenCalled()
    expect(actions.visibleHeadingIds).not.toHaveBeenCalled()
  })
})

describe('createCommands.pinHeadingPostSwap', () => {
  test('pins the heading post-layout at its overlay offset and sets it current', () => {
    const built = makePositionalViewerRef({ a: 0, a1: 5, b: 40 })
    const { deps, actions } = makeDeps({ viewerRef: built.ref })
    createCommands(deps).pinHeadingPostSwap('a1')
    // a1's ancestor stack is the H1 pill (1 row), so it pins one row below the fold.
    expect(built.calls).toContain('pinHeadingPostLayout(a1,1)')
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a1')
  })
})

describe('createCommands.restoreScroll', () => {
  test('pins the saved scroll top and current heading', () => {
    const built = makePositionalViewerRef({ a: 0, a1: 5, b: 40 })
    const { deps, actions } = makeDeps({ viewerRef: built.ref })
    createCommands(deps).restoreScroll({ scrollTop: 42, currentHeadingId: 'a1' })
    expect(built.calls).toContain('pinScrollTop(42)')
    expect(actions.currentHeadingId).toHaveBeenCalledWith('a1')
  })

  test('skips setting current heading when the snapshot has none', () => {
    const built = makePositionalViewerRef({ a: 0, a1: 5, b: 40 })
    const { deps, actions } = makeDeps({ viewerRef: built.ref })
    createCommands(deps).restoreScroll({ scrollTop: 42, currentHeadingId: null })
    expect(built.calls).toContain('pinScrollTop(42)')
    expect(actions.currentHeadingId).not.toHaveBeenCalled()
  })
})

describe('createCommands.resetToTop', () => {
  test('pins the top and clears heading state', () => {
    const built = makePositionalViewerRef({ a: 0, a1: 5, b: 40 })
    const { deps, actions } = makeDeps({ viewerRef: built.ref })
    createCommands(deps).resetToTop()
    expect(built.calls).toContain('pinScrollTop(0)')
    expect(actions.currentHeadingId).toHaveBeenCalledWith(null)
    expect(actions.visibleHeadingIds).toHaveBeenCalled()
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
