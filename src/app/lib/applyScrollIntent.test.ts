import { describe, expect, test, mock } from 'bun:test'

import { applyScrollIntent } from './applyScrollIntent'
import type { Commands } from './commands'
import type { ScrollIntent } from './documentNavigation'

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
    toggleHelp: mock(),
    startSearch: mock(),
    applySearchPattern: mock(),
    stepMatch: mock(),
    clearSearch: mock(),
    followLink: mock(),
    goBack: mock(),
    goToDocument: mock(),
    openEditor: mock(),
    toggleMouse: mock(),
    quit: mock(),
    resetForNewDoc: mock(),
    pinHeadingPostSwap: mock(),
    restoreScroll: mock(),
    resetToTop: mock(),
  }
}

describe('applyScrollIntent routing', () => {
  test('restore → restoreScroll({scrollTop, currentHeadingId})', () => {
    const c = makeCommands()
    const scroll: ScrollIntent = { kind: 'restore', scrollTop: 42, currentHeadingId: 'h1' }
    applyScrollIntent({ scroll, commands: c, headingIds: [] })
    expect(c.restoreScroll).toHaveBeenCalledWith({ scrollTop: 42, currentHeadingId: 'h1' })
  })

  test('same-doc anchor (postSwap:false) with known heading → jumpToHeading(id)', () => {
    const c = makeCommands()
    const scroll: ScrollIntent = { kind: 'anchor', headingId: 'h2', postSwap: false }
    applyScrollIntent({ scroll, commands: c, headingIds: ['h1', 'h2'] })
    expect(c.jumpToHeading).toHaveBeenCalledWith('h2')
  })

  test('same-doc anchor (postSwap:false) with unknown slug → no-op', () => {
    const c = makeCommands()
    const scroll: ScrollIntent = { kind: 'anchor', headingId: 'broken', postSwap: false }
    applyScrollIntent({ scroll, commands: c, headingIds: ['h1', 'h2'] })
    expect(c.jumpToHeading).not.toHaveBeenCalled()
    expect(c.resetToTop).not.toHaveBeenCalled()
  })

  test('post-swap anchor with known heading → pinHeadingPostSwap(id)', () => {
    const c = makeCommands()
    const scroll: ScrollIntent = { kind: 'anchor', headingId: 'h2', postSwap: true }
    applyScrollIntent({ scroll, commands: c, headingIds: ['h1', 'h2'] })
    expect(c.pinHeadingPostSwap).toHaveBeenCalledWith('h2')
  })

  test('post-swap anchor with absent heading → resetToTop() fallback', () => {
    const c = makeCommands()
    const scroll: ScrollIntent = { kind: 'anchor', headingId: 'gone', postSwap: true }
    applyScrollIntent({ scroll, commands: c, headingIds: ['h1'] })
    expect(c.resetToTop).toHaveBeenCalled()
    expect(c.pinHeadingPostSwap).not.toHaveBeenCalled()
  })

  test('top → resetToTop()', () => {
    const c = makeCommands()
    applyScrollIntent({ scroll: { kind: 'top' }, commands: c, headingIds: [] })
    expect(c.resetToTop).toHaveBeenCalled()
  })
})
