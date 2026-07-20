import { describe, expect, test, mock } from 'bun:test'
import { dispatch, syncHeadings } from './dispatch'
import type { AppState, ScrollboxHandle } from '../state'
import type { TocEntry } from './ast'
import type { RefObject } from 'react'

function makeViewerRef(opts: { nearTop?: string | null; visible?: Set<string> } = {}): {
  ref: RefObject<ScrollboxHandle | null>
  calls: string[]
} {
  const calls: string[] = []
  const handle: ScrollboxHandle = {
    scrollBy: d => calls.push(`scrollBy(${d})`),
    scrollTo: y => calls.push(`scrollTo(${y})`),
    scrollToBottom: () => calls.push('scrollToBottom'),
    scrollChildToTop: (id, topOffset) => calls.push(`scrollChildToTop(${id},${topOffset ?? 0})`),
    getHeadingNearTop: () => opts.nearTop ?? null,
    getVisibleHeadingIds: () => opts.visible ?? new Set<string>(),
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
  }
  return { ref: { current: handle }, calls }
}

function makeState(overrides: Partial<AppState> = {}): AppState {
  const viewer = overrides.viewerRef ?? makeViewerRef().ref
  return {
    focus: 'viewer',
    setFocus: mock(),
    currentHeadingId: null,
    setCurrentHeadingId: mock(),
    viewerRef: viewer,
    expanded: new Map(),
    toggleExpanded: mock(),
    tocCursorId: null,
    setTocCursorId: mock(),
    search: null,
    setSearch: mock(),
    mouseEnabled: false,
    toggleMouse: mock(),
    tocVisible: true,
    toggleTocVisible: mock(),
    visibleHeadingIds: new Set<string>(),
    setVisibleHeadingIds: mock(),
    flashMessage: null,
    setFlashMessage: mock(),
    ...overrides,
  } as AppState
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
  }
  return { ref: { current: handle } }
}

describe('dispatch', () => {
  test('focusSidebar sets cursor to first when null', () => {
    const state = makeState()
    dispatch({ kind: 'focusSidebar' }, state, toc, headingIds, 24, () => {})
    expect(state.setTocCursorId).toHaveBeenCalledWith('a')
    expect(state.setFocus).toHaveBeenCalledWith('sidebar')
  })

  test('focusSidebar no-op when toc empty', () => {
    const state = makeState()
    dispatch({ kind: 'focusSidebar' }, state, [], [], 24, () => {})
    expect(state.setTocCursorId).not.toHaveBeenCalled()
    expect(state.setFocus).not.toHaveBeenCalled()
  })

  test('focusSidebar does not reset cursor when already set', () => {
    const state = makeState({ tocCursorId: 'b' })
    dispatch({ kind: 'focusSidebar' }, state, toc, headingIds, 24, () => {})
    expect(state.setTocCursorId).not.toHaveBeenCalled()
    expect(state.setFocus).toHaveBeenCalledWith('sidebar')
  })

  test('tocSelect scrolls to cursor heading and focuses viewer', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, tocCursorId: 'a1' })
    dispatch({ kind: 'tocSelect' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1,1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
    expect(state.setFocus).toHaveBeenCalledWith('viewer')
  })

  test('tocSelect is no-op when no cursor', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, tocCursorId: null })
    dispatch({ kind: 'tocSelect' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toHaveLength(0)
    expect(state.setCurrentHeadingId).not.toHaveBeenCalled()
  })

  test('tocJump scrolls to the given id and focuses viewer', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'tocJump', id: 'a1' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1,1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
    expect(state.setFocus).toHaveBeenCalledWith('viewer')
  })

  test('tocToggleId toggles the given id without touching focus', () => {
    const state = makeState()
    dispatch({ kind: 'tocToggleId', id: 'a' }, state, toc, headingIds, 24, () => {})
    expect(state.toggleExpanded).toHaveBeenCalledWith('a')
    expect(state.setFocus).not.toHaveBeenCalled()
    expect(state.setCurrentHeadingId).not.toHaveBeenCalled()
  })

  test('tocDown advances cursor through visible entries', () => {
    const state = makeState({ tocCursorId: 'a' })
    dispatch({ kind: 'tocDown' }, state, toc, headingIds, 24, () => {})
    // a1 is visible because level 2 entries are expanded by default
    expect(state.setTocCursorId).toHaveBeenCalledWith('a1')
  })

  test('tocUp moves cursor backward', () => {
    const state = makeState({ tocCursorId: 'a1' })
    dispatch({ kind: 'tocUp' }, state, toc, headingIds, 24, () => {})
    expect(state.setTocCursorId).toHaveBeenCalledWith('a')
  })

  test('tocToggle calls toggleExpanded with cursor id', () => {
    const state = makeState({ tocCursorId: 'a' })
    dispatch({ kind: 'tocToggle' }, state, toc, headingIds, 24, () => {})
    expect(state.toggleExpanded).toHaveBeenCalledWith('a')
  })

  test('tocToggle is no-op when no cursor', () => {
    const state = makeState({ tocCursorId: null })
    dispatch({ kind: 'tocToggle' }, state, toc, headingIds, 24, () => {})
    expect(state.toggleExpanded).not.toHaveBeenCalled()
  })

  test('nextHeading advances to next in doc order', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: 'a' })
    dispatch({ kind: 'nextHeading' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1,1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
  })

  test('nextHeading goes to first when no current', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: null })
    dispatch({ kind: 'nextHeading' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a,0)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a')
  })

  test('nextHeading clamps at last heading', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: 'b' })
    dispatch({ kind: 'nextHeading' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(b,0)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('b')
  })

  test('prevHeading goes backward from currentHeadingId', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: 'b' })
    dispatch({ kind: 'prevHeading' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1,1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
  })

  test('prevHeading seeds from viewport heading when current is null', () => {
    // User scrolled past `a1` with j/k; pressing N should go back to `a1`'s predecessor.
    const vref = makeViewerRef({ nearTop: 'a1' })
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: null })
    dispatch({ kind: 'prevHeading' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a,0)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a')
  })

  test('nextHeading seeds from viewport heading when current is null', () => {
    const vref = makeViewerRef({ nearTop: 'a' })
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: null })
    dispatch({ kind: 'nextHeading' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1,1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
  })

  test('prevHeading with no current and no viewport heading goes to last', () => {
    const vref = makeViewerRef({ nearTop: null })
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: null })
    dispatch({ kind: 'prevHeading' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(b,0)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('b')
  })

  test('prevHeading clamps at first heading', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: 'a' })
    dispatch({ kind: 'prevHeading' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a,0)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a')
  })

  test('clearSearch clears search and returns to viewer when in search focus', () => {
    const state = makeState({
      focus: 'search',
      search: { pattern: 'x', matches: [], index: -1, dir: 'forward', committed: false },
    })
    dispatch({ kind: 'clearSearch' }, state, toc, headingIds, 24, () => {})
    expect(state.setSearch).toHaveBeenCalledWith(null)
    expect(state.setFocus).toHaveBeenCalledWith('viewer')
  })

  test('startSearch opens an empty uncommitted search and focuses the input', () => {
    const state = makeState()
    dispatch({ kind: 'startSearch', dir: 'forward' }, state, toc, headingIds, 24, () => {})
    expect(state.setSearch).toHaveBeenCalledWith({
      pattern: '',
      matches: [],
      index: -1,
      dir: 'forward',
      committed: false,
    })
    expect(state.setFocus).toHaveBeenCalledWith('search')
  })

  test('clearSearch does not refocus when already in viewer', () => {
    const state = makeState({
      focus: 'viewer',
      search: { pattern: 'x', matches: [], index: -1, dir: 'forward', committed: false },
    })
    dispatch({ kind: 'clearSearch' }, state, toc, headingIds, 24, () => {})
    expect(state.setSearch).toHaveBeenCalledWith(null)
    expect(state.setFocus).not.toHaveBeenCalled()
  })

  test('quit calls onQuit', () => {
    const state = makeState()
    let quit = false
    dispatch({ kind: 'quit' }, state, toc, headingIds, 24, () => {
      quit = true
    })
    expect(quit).toBe(true)
  })

  test('scrollLine calls scrollBy with delta', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'scrollLine', delta: 3 }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollBy(3)')
  })

  test('scrollPage multiplies by viewport height minus 2', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'scrollPage', delta: 1 }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollBy(22)')
  })

  test('top scrolls to 0', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'top' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollTo(0)')
  })

  test('bottom calls scrollToBottom', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'bottom' }, state, toc, headingIds, 24, () => {})
    expect(vref.calls).toContain('scrollToBottom')
  })

  test('toggleMouse calls toggleMouse on state', () => {
    const state = makeState()
    dispatch({ kind: 'toggleMouse' }, state, toc, headingIds, 24, () => {})
    expect(state.toggleMouse).toHaveBeenCalled()
  })

  test('openEditor invokes onOpenEditor callback once', () => {
    const state = makeState()
    const onOpenEditor = mock()
    dispatch({ kind: 'openEditor' }, state, toc, headingIds, 20, () => {}, undefined, onOpenEditor)
    expect(onOpenEditor).toHaveBeenCalledTimes(1)
  })
})

describe('dispatch toggleTocVisible', () => {
  test('toggles visibility', () => {
    const toggleTocVisible = mock()
    const state = makeState({ toggleTocVisible })
    dispatch({ kind: 'toggleTocVisible' }, state, toc, headingIds, 20, () => {})
    expect(toggleTocVisible).toHaveBeenCalledTimes(1)
  })

  test('hiding from sidebar returns focus to viewer', () => {
    const setFocus = mock()
    const state = makeState({ focus: 'sidebar', tocVisible: true, setFocus })
    dispatch({ kind: 'toggleTocVisible' }, state, toc, headingIds, 20, () => {})
    expect(setFocus).toHaveBeenCalledWith('viewer')
  })

  test('hiding from viewer does not change focus', () => {
    const setFocus = mock()
    const state = makeState({ focus: 'viewer', tocVisible: true, setFocus })
    dispatch({ kind: 'toggleTocVisible' }, state, toc, headingIds, 20, () => {})
    expect(setFocus).not.toHaveBeenCalled()
  })

  test('focusSidebar is a no-op when toc hidden', () => {
    const setFocus = mock()
    const state = makeState({ tocVisible: false, setFocus })
    dispatch({ kind: 'focusSidebar' }, state, toc, headingIds, 20, () => {})
    expect(setFocus).not.toHaveBeenCalled()
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

describe('syncHeadings sibling handoff (blip fix)', () => {
  test('previous section stays current while a blank line (not the new header) is at the fold', () => {
    // sa scrolled above; a blank line sits at the fold (row 1) with sb one row
    // below it (row 2). The handoff must NOT fire early — current stays sa.
    const { ref } = makePositionalViewerRef({ h1: -100, sa: -5, sb: 2 })
    const state = makeState({ viewerRef: ref, currentHeadingId: null })
    syncHeadings(state, siblingToc, siblingIds)
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('sa')
    expect(state.setCurrentHeadingId).not.toHaveBeenCalledWith('sb')
  })

  test('handoff fires exactly when the new header reaches the fold', () => {
    // sb now at the fold (row 1, = ancestor-stack height of 1). Current flips to sb.
    const { ref } = makePositionalViewerRef({ h1: -100, sa: -5, sb: 1 })
    const state = makeState({ viewerRef: ref, currentHeadingId: 'sa' })
    syncHeadings(state, siblingToc, siblingIds)
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('sb')
  })
})

describe('syncHeadings breadcrumb-overlay offset', () => {
  test('a heading behind the overlay becomes current and is excluded from visible', () => {
    // a (H1) is scrolled off above; a1 (H2 under a) sits at row 0, behind the
    // breadcrumb overlay; b is far below the fold. Without offset resolution a1
    // would count as "visible" (filtered from the breadcrumb) yet be hidden
    // behind the overlay — it would vanish. The fixed point must instead make a1
    // current and exclude it from the visible set so it shows as a crumb.
    const { ref } = makePositionalViewerRef({ a: -3, a1: 0, b: 50 })
    const state = makeState({
      viewerRef: ref,
      currentHeadingId: null,
      visibleHeadingIds: new Set(['a1']),
    })
    syncHeadings(state, toc, headingIds)
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
    const lastVisible = (state.setVisibleHeadingIds as ReturnType<typeof mock>).mock.calls.at(
      -1,
    )?.[0]
    expect(lastVisible?.has('a1')).toBe(false)
  })
})
