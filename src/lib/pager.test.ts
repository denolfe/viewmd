// lib/pager.test.ts
import { describe, expect, test } from 'bun:test'
import {
  createPagerState,
  scroll,
  renderViewport,
  goTo,
  isAtEnd,
  formatInfo,
  findAncestorHeaders,
} from './pager'
import type { Line } from './lines'

const makeLines = (n: number): Line[] =>
  Array.from({ length: n }, (_, i) => ({ content: `Line ${i}`, headerLevel: undefined }))

describe('createPagerState', () => {
  test('initializes with correct dimensions', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)

    expect(state.topLine).toBe(0)
    expect(state.lines.length).toBe(100)
    expect(state.termHeight).toBe(24)
    expect(state.termWidth).toBe(80)
  })
})

describe('scroll', () => {
  test('scrolls down by delta', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)

    scroll(state, 5)
    expect(state.topLine).toBe(5)
  })

  test('scrolls up by negative delta', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 10

    scroll(state, -3)
    expect(state.topLine).toBe(7)
  })

  test('clamps at top', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 5

    scroll(state, -10)
    expect(state.topLine).toBe(0)
  })

  test('clamps at bottom', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)

    scroll(state, 200)
    // Should stop so last line is visible
    expect(state.topLine).toBe(100 - 23) // lines - (height - 1 for prompt)
  })
})

describe('renderViewport', () => {
  test('renders visible lines only', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 5, 80)
    state.topLine = 10

    const output = renderViewport(state)
    expect(output).toContain('Line 10')
    expect(output).toContain('Line 13') // 4 lines visible (5 - 1 for prompt)
    expect(output).not.toContain('Line 9')
    expect(output).not.toContain('Line 14')
  })

  test('shows : prompt at bottom', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 5, 80)

    const output = renderViewport(state)
    expect(output).toContain(':')
  })

  test('shows (END) when at bottom', () => {
    const lines = makeLines(10)
    const state = createPagerState(lines, new Map(), 20, 80)
    state.topLine = 0 // All lines fit

    const output = renderViewport(state)
    expect(output).toContain('(END)')
  })
})

describe('goTo', () => {
  test('jumps to specific line', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)

    goTo(state, 50)
    expect(state.topLine).toBe(50)
  })

  test('clamps to top when negative', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)

    goTo(state, -10)
    expect(state.topLine).toBe(0)
  })

  test('clamps to max when beyond end', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)

    goTo(state, 200)
    expect(state.topLine).toBe(100 - 23) // lines - (height - 1 for prompt)
  })
})

describe('isAtEnd', () => {
  test('returns false when not at end', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)

    expect(isAtEnd(state)).toBe(false)
  })

  test('returns true when scrolled to end', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 100 - 23 // max scroll position

    expect(isAtEnd(state)).toBe(true)
  })

  test('returns true when content fits in viewport', () => {
    const lines = makeLines(10)
    const state = createPagerState(lines, new Map(), 24, 80)

    expect(isAtEnd(state)).toBe(true)
  })
})

describe('formatInfo', () => {
  test('formats position info correctly', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 10

    const info = formatInfo(state)
    expect(info).toBe('lines 11-33/100 (33%)')
  })

  test('shows 100% at end', () => {
    const lines = makeLines(100)
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 77 // max top

    const info = formatInfo(state)
    expect(info).toBe('lines 78-100/100 (100%)')
  })

  test('handles empty lines array', () => {
    const state = createPagerState([], new Map(), 24, 80)

    const info = formatInfo(state)
    expect(info).toBe('lines 0-0/0 (0%)')
  })
})

describe('findAncestorHeaders', () => {
  test('returns empty when no headers', () => {
    const lines = makeLines(10)
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 5

    expect(findAncestorHeaders(state)).toEqual([])
  })

  test('returns H1 when scrolled past it', () => {
    const lines: Line[] = [
      { content: '# Title', headerLevel: 1 },
      { content: 'text', headerLevel: undefined },
      { content: 'more', headerLevel: undefined },
    ]
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 2

    const ancestors = findAncestorHeaders(state)
    expect(ancestors).toEqual([{ lineIndex: 0, level: 1, content: '# Title' }])
  })

  test('returns H1 and H2 when under H2', () => {
    const lines: Line[] = [
      { content: '# Title', headerLevel: 1 },
      { content: 'text', headerLevel: undefined },
      { content: '## Section', headerLevel: 2 },
      { content: 'content', headerLevel: undefined },
      { content: 'more', headerLevel: undefined },
    ]
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 4

    const ancestors = findAncestorHeaders(state)
    expect(ancestors).toEqual([
      { lineIndex: 0, level: 1, content: '# Title' },
      { lineIndex: 2, level: 2, content: '## Section' },
    ])
  })

  test('returns full hierarchy for deep nesting', () => {
    const lines: Line[] = [
      { content: '# H1', headerLevel: 1 },
      { content: '## H2', headerLevel: 2 },
      { content: '### H3', headerLevel: 3 },
      { content: 'deep content', headerLevel: undefined },
    ]
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 3

    const ancestors = findAncestorHeaders(state)
    expect(ancestors).toEqual([
      { lineIndex: 0, level: 1, content: '# H1' },
      { lineIndex: 1, level: 2, content: '## H2' },
      { lineIndex: 2, level: 3, content: '### H3' },
    ])
  })

  test('includes siblings under the same parent', () => {
    const lines: Line[] = [
      { content: '# Title', headerLevel: 1 },
      { content: '## Section A', headerLevel: 2 },
      { content: 'a content', headerLevel: undefined },
      { content: '## Section B', headerLevel: 2 },
      { content: 'b content', headerLevel: undefined },
    ]
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 4 // Under Section B

    const ancestors = findAncestorHeaders(state)
    expect(ancestors).toEqual([
      { lineIndex: 0, level: 1, content: '# Title' },
      { lineIndex: 1, level: 2, content: '## Section A' },
      { lineIndex: 3, level: 2, content: '## Section B' },
    ])
  })

  test('includes sibling H1s when at top level', () => {
    const lines: Line[] = [
      { content: '# Title', headerLevel: 1 },
      { content: '## Old Section', headerLevel: 2 },
      { content: '# New Title', headerLevel: 1 },
      { content: 'content', headerLevel: undefined },
    ]
    const state = createPagerState(lines, new Map(), 24, 80)
    state.topLine = 3

    const ancestors = findAncestorHeaders(state)
    expect(ancestors).toEqual([
      { lineIndex: 0, level: 1, content: '# Title' },
      { lineIndex: 2, level: 1, content: '# New Title' },
    ])
  })
})
