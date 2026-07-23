import { describe, expect, test, mock } from 'bun:test'
import { dispatch } from './dispatch'
import type { Commands } from './commands'

function makeCommands(): Commands {
  return {
    scrollBy: mock(),
    scrollPage: mock(),
    scrollHalf: mock(),
    scrollToTop: mock(),
    scrollToBottom: mock(),
    syncFromScroll: mock(),
    jumpHeadingBy: mock(),
    jumpToHeading: mock(),
    jumpToCursor: mock(),
    focusSidebar: mock(),
    focusViewer: mock(),
    tocMove: mock(),
    toggleCursorExpanded: mock(),
    toggleExpanded: mock(),
    toggleTocVisible: mock(),
    startSearch: mock(),
    applySearchPattern: mock(),
    stepMatch: mock(),
    clearSearch: mock(),
    followLink: mock(),
    goBack: mock(),
    openEditor: mock(),
    toggleMouse: mock(),
    quit: mock(),
    resetForNewDoc: mock(),
    pinHeadingPostSwap: mock(),
    restoreScroll: mock(),
    resetToTop: mock(),
  }
}

describe('dispatch routing', () => {
  test('nextHeading → jumpHeadingBy(1)', () => {
    const c = makeCommands()
    dispatch({ kind: 'nextHeading' }, c)
    expect(c.jumpHeadingBy).toHaveBeenCalledWith(1)
  })
  test('prevHeading → jumpHeadingBy(-1)', () => {
    const c = makeCommands()
    dispatch({ kind: 'prevHeading' }, c)
    expect(c.jumpHeadingBy).toHaveBeenCalledWith(-1)
  })
  test('scrollLine → scrollBy(delta)', () => {
    const c = makeCommands()
    dispatch({ kind: 'scrollLine', delta: 3 }, c)
    expect(c.scrollBy).toHaveBeenCalledWith(3)
  })
  test('scrollPage → scrollPage(delta)', () => {
    const c = makeCommands()
    dispatch({ kind: 'scrollPage', delta: 1 }, c)
    expect(c.scrollPage).toHaveBeenCalledWith(1)
  })
  test('scrollHalf → scrollHalf(delta)', () => {
    const c = makeCommands()
    dispatch({ kind: 'scrollHalf', delta: -1 }, c)
    expect(c.scrollHalf).toHaveBeenCalledWith(-1)
  })
  test('top/bottom → scrollToTop/scrollToBottom', () => {
    const c = makeCommands()
    dispatch({ kind: 'top' }, c)
    expect(c.scrollToTop).toHaveBeenCalled()
    dispatch({ kind: 'bottom' }, c)
    expect(c.scrollToBottom).toHaveBeenCalled()
  })
  test('tocSelect → jumpToCursor', () => {
    const c = makeCommands()
    dispatch({ kind: 'tocSelect' }, c)
    expect(c.jumpToCursor).toHaveBeenCalled()
  })
  test('tocJump → jumpToHeading(id)', () => {
    const c = makeCommands()
    dispatch({ kind: 'tocJump', id: 'a1' }, c)
    expect(c.jumpToHeading).toHaveBeenCalledWith('a1')
  })
  test('tocToggle → toggleCursorExpanded', () => {
    const c = makeCommands()
    dispatch({ kind: 'tocToggle' }, c)
    expect(c.toggleCursorExpanded).toHaveBeenCalled()
  })
  test('tocToggleId → toggleExpanded(id)', () => {
    const c = makeCommands()
    dispatch({ kind: 'tocToggleId', id: 'a' }, c)
    expect(c.toggleExpanded).toHaveBeenCalledWith('a')
  })
  test('tocUp/tocDown → tocMove(∓1)', () => {
    const c = makeCommands()
    dispatch({ kind: 'tocUp' }, c)
    expect(c.tocMove).toHaveBeenCalledWith(-1)
    dispatch({ kind: 'tocDown' }, c)
    expect(c.tocMove).toHaveBeenCalledWith(1)
  })
  test('focusSidebar/focusViewer', () => {
    const c = makeCommands()
    dispatch({ kind: 'focusSidebar' }, c)
    expect(c.focusSidebar).toHaveBeenCalled()
    dispatch({ kind: 'focusViewer' }, c)
    expect(c.focusViewer).toHaveBeenCalled()
  })
  test('quit → quit()', () => {
    const c = makeCommands()
    dispatch({ kind: 'quit' }, c)
    expect(c.quit).toHaveBeenCalled()
  })
  test('startSearch → startSearch(dir)', () => {
    const c = makeCommands()
    dispatch({ kind: 'startSearch', dir: 'forward' }, c)
    expect(c.startSearch).toHaveBeenCalledWith('forward')
  })
  test('nextMatch/prevMatch → stepMatch(±1)', () => {
    const c = makeCommands()
    dispatch({ kind: 'nextMatch' }, c)
    expect(c.stepMatch).toHaveBeenCalledWith(1)
    dispatch({ kind: 'prevMatch' }, c)
    expect(c.stepMatch).toHaveBeenCalledWith(-1)
  })
  test('clearSearch → clearSearch()', () => {
    const c = makeCommands()
    dispatch({ kind: 'clearSearch' }, c)
    expect(c.clearSearch).toHaveBeenCalled()
  })
  test('toggleMouse → toggleMouse()', () => {
    const c = makeCommands()
    dispatch({ kind: 'toggleMouse' }, c)
    expect(c.toggleMouse).toHaveBeenCalled()
  })
  test('openEditor → openEditor()', () => {
    const c = makeCommands()
    dispatch({ kind: 'openEditor' }, c)
    expect(c.openEditor).toHaveBeenCalled()
  })
  test('goBack → goBack()', () => {
    const c = makeCommands()
    dispatch({ kind: 'goBack' }, c)
    expect(c.goBack).toHaveBeenCalled()
  })
  test('toggleTocVisible → toggleTocVisible()', () => {
    const c = makeCommands()
    dispatch({ kind: 'toggleTocVisible' }, c)
    expect(c.toggleTocVisible).toHaveBeenCalled()
  })
  test('noop → nothing', () => {
    const c = makeCommands()
    dispatch({ kind: 'noop' }, c)
    for (const fn of Object.values(c)) expect(fn).not.toHaveBeenCalled()
  })
})
