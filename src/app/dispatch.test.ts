import { describe, expect, test, mock } from 'bun:test'
import { dispatch } from './dispatch'
import type { AppState, ScrollboxHandle } from './state'
import type { TocEntry } from './ast'
import type { RefObject } from 'react'

function makeViewerRef(opts: { nearTop?: string | null } = {}): {
  ref: RefObject<ScrollboxHandle | null>
  calls: string[]
} {
  const calls: string[] = []
  const handle: ScrollboxHandle = {
    scrollBy: d => calls.push(`scrollBy(${d})`),
    scrollTo: y => calls.push(`scrollTo(${y})`),
    scrollToBottom: () => calls.push('scrollToBottom'),
    scrollChildIntoView: id => calls.push(`scrollChildIntoView(${id})`),
    scrollChildToTop: id => calls.push(`scrollChildToTop(${id})`),
    getHeadingNearTop: () => opts.nearTop ?? null,
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

describe('dispatch', () => {
  test('focusSidebar sets cursor to first when null', () => {
    const state = makeState()
    dispatch({ kind: 'focusSidebar' }, state, toc, 24, () => {})
    expect(state.setTocCursorId).toHaveBeenCalledWith('a')
    expect(state.setFocus).toHaveBeenCalledWith('sidebar')
  })

  test('focusSidebar no-op when toc empty', () => {
    const state = makeState()
    dispatch({ kind: 'focusSidebar' }, state, [], 24, () => {})
    expect(state.setTocCursorId).not.toHaveBeenCalled()
    expect(state.setFocus).not.toHaveBeenCalled()
  })

  test('focusSidebar does not reset cursor when already set', () => {
    const state = makeState({ tocCursorId: 'b' })
    dispatch({ kind: 'focusSidebar' }, state, toc, 24, () => {})
    expect(state.setTocCursorId).not.toHaveBeenCalled()
    expect(state.setFocus).toHaveBeenCalledWith('sidebar')
  })

  test('tocSelect scrolls to cursor heading and focuses viewer', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, tocCursorId: 'a1' })
    dispatch({ kind: 'tocSelect' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
    expect(state.setFocus).toHaveBeenCalledWith('viewer')
  })

  test('tocSelect is no-op when no cursor', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, tocCursorId: null })
    dispatch({ kind: 'tocSelect' }, state, toc, 24, () => {})
    expect(vref.calls).toHaveLength(0)
    expect(state.setCurrentHeadingId).not.toHaveBeenCalled()
  })

  test('tocDown advances cursor through visible entries', () => {
    const state = makeState({ tocCursorId: 'a' })
    dispatch({ kind: 'tocDown' }, state, toc, 24, () => {})
    // a1 is visible because level 2 entries are expanded by default
    expect(state.setTocCursorId).toHaveBeenCalledWith('a1')
  })

  test('tocUp moves cursor backward', () => {
    const state = makeState({ tocCursorId: 'a1' })
    dispatch({ kind: 'tocUp' }, state, toc, 24, () => {})
    expect(state.setTocCursorId).toHaveBeenCalledWith('a')
  })

  test('tocToggle calls toggleExpanded with cursor id', () => {
    const state = makeState({ tocCursorId: 'a' })
    dispatch({ kind: 'tocToggle' }, state, toc, 24, () => {})
    expect(state.toggleExpanded).toHaveBeenCalledWith('a')
  })

  test('tocToggle is no-op when no cursor', () => {
    const state = makeState({ tocCursorId: null })
    dispatch({ kind: 'tocToggle' }, state, toc, 24, () => {})
    expect(state.toggleExpanded).not.toHaveBeenCalled()
  })

  test('nextHeading advances to next in doc order', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: 'a' })
    dispatch({ kind: 'nextHeading' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
  })

  test('nextHeading goes to first when no current', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: null })
    dispatch({ kind: 'nextHeading' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a')
  })

  test('nextHeading clamps at last heading', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: 'b' })
    dispatch({ kind: 'nextHeading' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(b)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('b')
  })

  test('prevHeading goes backward from currentHeadingId', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: 'b' })
    dispatch({ kind: 'prevHeading' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
  })

  test('prevHeading seeds from viewport heading when current is null', () => {
    // User scrolled past `a1` with j/k; pressing N should go back to `a1`'s predecessor.
    const vref = makeViewerRef({ nearTop: 'a1' })
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: null })
    dispatch({ kind: 'prevHeading' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a')
  })

  test('nextHeading seeds from viewport heading when current is null', () => {
    const vref = makeViewerRef({ nearTop: 'a' })
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: null })
    dispatch({ kind: 'nextHeading' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a1)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a1')
  })

  test('prevHeading with no current and no viewport heading goes to last', () => {
    const vref = makeViewerRef({ nearTop: null })
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: null })
    dispatch({ kind: 'prevHeading' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(b)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('b')
  })

  test('prevHeading clamps at first heading', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref, currentHeadingId: 'a' })
    dispatch({ kind: 'prevHeading' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollChildToTop(a)')
    expect(state.setCurrentHeadingId).toHaveBeenCalledWith('a')
  })

  test('clearSearch clears search and returns to viewer when in search focus', () => {
    const state = makeState({
      focus: 'search',
      search: { pattern: 'x', matches: [], index: -1, dir: 'forward' },
    })
    dispatch({ kind: 'clearSearch' }, state, toc, 24, () => {})
    expect(state.setSearch).toHaveBeenCalledWith(null)
    expect(state.setFocus).toHaveBeenCalledWith('viewer')
  })

  test('clearSearch does not refocus when already in viewer', () => {
    const state = makeState({
      focus: 'viewer',
      search: { pattern: 'x', matches: [], index: -1, dir: 'forward' },
    })
    dispatch({ kind: 'clearSearch' }, state, toc, 24, () => {})
    expect(state.setSearch).toHaveBeenCalledWith(null)
    expect(state.setFocus).not.toHaveBeenCalled()
  })

  test('quit calls onQuit', () => {
    const state = makeState()
    let quit = false
    dispatch({ kind: 'quit' }, state, toc, 24, () => {
      quit = true
    })
    expect(quit).toBe(true)
  })

  test('scrollLine calls scrollBy with delta', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'scrollLine', delta: 3 }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollBy(3)')
  })

  test('scrollPage multiplies by viewport height minus 2', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'scrollPage', delta: 1 }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollBy(22)')
  })

  test('top scrolls to 0', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'top' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollTo(0)')
  })

  test('bottom calls scrollToBottom', () => {
    const vref = makeViewerRef()
    const state = makeState({ viewerRef: vref.ref })
    dispatch({ kind: 'bottom' }, state, toc, 24, () => {})
    expect(vref.calls).toContain('scrollToBottom')
  })

  test('toggleMouse calls toggleMouse on state', () => {
    const state = makeState()
    dispatch({ kind: 'toggleMouse' }, state, toc, 24, () => {})
    expect(state.toggleMouse).toHaveBeenCalled()
  })
})
