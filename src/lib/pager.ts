import { ANSI } from './ansi'
import { colors } from './colors'
import type { ImageData } from './images'
import { parseKey, KEY } from './keys'
import type { Line } from './lines'
import { splitIntoLines } from './lines'
import type { Match } from './search'
import { findMatches, highlightLine } from './search'

export type PagerState = {
  lines: Line[]
  images: Map<string, ImageData>
  topLine: number
  termHeight: number
  termWidth: number
  searchPattern: string | null
  searchMatches: Match[]
  searchIndex: number
}

export function createPagerState(
  lines: Line[],
  images: Map<string, ImageData>,
  termHeight: number,
  termWidth: number,
): PagerState {
  return {
    lines,
    images,
    topLine: 0,
    termHeight,
    termWidth,
    searchPattern: null,
    searchMatches: [],
    searchIndex: -1,
  }
}

/** Scroll by delta lines, clamping to bounds. */
export function scroll(state: PagerState, delta: number): void {
  const viewportHeight = state.termHeight - 1 // Reserve 1 line for prompt
  const maxTop = Math.max(0, state.lines.length - viewportHeight)

  state.topLine = Math.max(0, Math.min(maxTop, state.topLine + delta))
}

/** Jump to specific line. */
export function goTo(state: PagerState, line: number): void {
  const viewportHeight = state.termHeight - 1
  const maxTop = Math.max(0, state.lines.length - viewportHeight)

  state.topLine = Math.max(0, Math.min(maxTop, line))
}

/** Check if at end of content. */
export function isAtEnd(state: PagerState): boolean {
  const viewportHeight = state.termHeight - 1
  return state.topLine + viewportHeight >= state.lines.length
}

/** Render current viewport to string (for testing). */
export function renderViewport(state: PagerState): string {
  const viewportHeight = state.termHeight - 1
  const endLine = Math.min(state.topLine + viewportHeight, state.lines.length)

  let output = ANSI.clearScreen + ANSI.cursorHome

  for (let i = state.topLine; i < endLine; i++) {
    const line = state.lines[i]!

    if (line.imageRef) {
      // Image placeholder - will be rendered separately in actual pager
      output += `[Image]\n`
    } else {
      let content = line.content
      // Apply search highlighting
      if (state.searchMatches.length > 0) {
        content = highlightLine({ content, matches: state.searchMatches, lineIndex: i })
      }
      output += content + '\n'
    }
  }

  // Prompt line
  output += isAtEnd(state) ? '(END)' : ':'

  return output
}

/** Format info line for = command. */
export function formatInfo(state: PagerState): string {
  if (state.lines.length === 0) {
    return 'lines 0-0/0 (0%)'
  }

  const viewportHeight = state.termHeight - 1
  const endLine = Math.min(state.topLine + viewportHeight, state.lines.length)
  const percent = Math.round((endLine / state.lines.length) * 100)

  return `lines ${state.topLine + 1}-${endLine}/${state.lines.length} (${percent}%)`
}

/**
 * Run interactive pager. Returns when user quits.
 */
export async function runPager(content: string, images: Map<string, ImageData>): Promise<void> {
  let termHeight = process.stdout.rows || 24
  let termWidth = process.stdout.columns || 80

  let lines = splitIntoLines(content, termWidth)
  let state = createPagerState(lines, images, termHeight, termWidth)

  // Handle terminal resize
  const handleResize = () => {
    termHeight = process.stdout.rows || 24
    termWidth = process.stdout.columns || 80

    // Re-split lines for new width
    lines = splitIntoLines(content, termWidth)

    // Preserve relative position
    const relativePos = state.topLine / Math.max(1, state.lines.length)

    // Preserve search pattern
    const { searchPattern, searchIndex } = state

    state = createPagerState(lines, images, termHeight, termWidth)

    // Restore position with bounds checking
    const targetLine = Math.floor(relativePos * state.lines.length)
    goTo(state, targetLine)

    // Recalculate search matches for new line structure
    state.searchPattern = searchPattern
    if (searchPattern) {
      state.searchMatches = findMatches(state.lines, searchPattern)
      state.searchIndex = Math.min(searchIndex, Math.max(0, state.searchMatches.length - 1))
    } else {
      state.searchMatches = []
      state.searchIndex = -1
    }

    render(state)
  }

  process.stdout.on('resize', handleResize)

  // Set up raw mode and mouse
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  process.stdin.resume()
  process.stdout.write(ANSI.cursorHide + ANSI.mouseOn)

  // Initial render
  await render(state)

  return new Promise<void>(resolve => {
    const handleKey = async (data: Buffer) => {
      const key = parseKey(data.toString())
      const viewportHeight = state.termHeight - 1

      switch (key) {
        case KEY.DOWN:
        case KEY.ENTER:
        case KEY.SCROLL_DOWN:
          scroll(state, 1)
          break
        case KEY.UP:
        case KEY.SCROLL_UP:
          scroll(state, -1)
          break
        case KEY.PAGE_DOWN:
          scroll(state, viewportHeight)
          break
        case KEY.PAGE_UP:
          scroll(state, -viewportHeight)
          break
        case KEY.HALF_DOWN:
          scroll(state, Math.floor(viewportHeight / 2))
          break
        case KEY.HALF_UP:
          scroll(state, -Math.floor(viewportHeight / 2))
          break
        case KEY.TOP:
          goTo(state, 0)
          break
        case KEY.BOTTOM:
          goTo(state, state.lines.length)
          break
        case KEY.SEARCH:
          await handleSearch({ state, direction: 'forward', keyHandler: handleKey })
          break
        case KEY.SEARCH_BACK:
          await handleSearch({ state, direction: 'backward', keyHandler: handleKey })
          break
        case KEY.NEXT_HEADER:
          jumpToHeader(state, 1)
          break
        case KEY.PREV_HEADER:
          jumpToHeader(state, -1)
          break
        case KEY.INFO:
          showInfo(state)
          return // Don't re-render, info shows on prompt line
        case KEY.QUIT:
          cleanup()
          resolve()
          return
      }

      await render(state)
    }

    const cleanup = () => {
      process.stdout.removeListener('resize', handleResize)
      process.stdin.removeListener('data', handleKey)
      process.stdin.pause()
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      process.stdout.write(ANSI.mouseOff + ANSI.cursorShow)
      process.stdout.write(ANSI.clearScreen + ANSI.cursorHome)
    }

    process.stdin.on('data', handleKey)
  })
}

/** Render current viewport to terminal. */
async function render(state: PagerState): Promise<void> {
  const viewportHeight = state.termHeight - 1

  process.stdout.write(ANSI.clearScreen + ANSI.cursorHome)

  // Render sticky headers first
  let rowsUsed = renderStickyHeaders(state)
  let lineIndex = state.topLine

  while (rowsUsed < viewportHeight && lineIndex < state.lines.length) {
    const line = state.lines[lineIndex]!

    if (line.imageRef) {
      const imageData = state.images.get(line.imageRef)
      const alt = imageData?.alt || 'Image'
      const { output, rows } = formatImageBox(alt)
      if (rowsUsed + rows <= viewportHeight) {
        process.stdout.write(output)
        rowsUsed += rows
      } else {
        // Not enough space for box, skip
        rowsUsed++
      }
    } else {
      let content = line.content
      if (state.searchMatches.length > 0) {
        content = highlightLine({ content, matches: state.searchMatches, lineIndex })
      }
      process.stdout.write(content + '\n')
      rowsUsed++
    }

    lineIndex++
  }

  // Fill remaining rows with ~ (vim style)
  while (rowsUsed < viewportHeight) {
    process.stdout.write('~\n')
    rowsUsed++
  }

  // Prompt line
  process.stdout.write(isAtEnd(state) ? '(END)' : ':')
}

/** Handle search input. */
async function handleSearch(params: {
  state: PagerState
  direction: 'forward' | 'backward'
  keyHandler: (data: Buffer) => void
}): Promise<void> {
  const { state, direction, keyHandler } = params
  const prompt = direction === 'forward' ? '/' : '?'

  // Show search prompt
  process.stdout.write(ANSI.cursorTo(state.termHeight, 1) + ANSI.eraseLine + prompt)
  process.stdout.write(ANSI.cursorShow)

  const pattern = await readLine(keyHandler)

  process.stdout.write(ANSI.cursorHide)

  if (pattern) {
    state.searchPattern = pattern
    state.searchMatches = findMatches(state.lines, pattern)
    state.searchIndex = -1

    if (state.searchMatches.length > 0) {
      // Jump to first match (or last for backward)
      if (direction === 'forward') {
        jumpToMatch(state, 1)
      } else {
        state.searchIndex = state.searchMatches.length
        jumpToMatch(state, -1)
      }
    }
  }
}

/** Read a line of input from user. Caller must pause other stdin listeners. */
function readLine(pauseHandler: (data: Buffer) => void): Promise<string> {
  process.stdin.removeListener('data', pauseHandler)

  return new Promise(resolve => {
    let buffer = ''

    const handler = (data: Buffer) => {
      const char = data.toString()

      if (char === '\r' || char === '\n') {
        process.stdin.removeListener('data', handler)
        process.stdin.on('data', pauseHandler)
        resolve(buffer)
      } else if (char === '\x7f' || char === '\x08') {
        // Backspace
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1)
          process.stdout.write('\b \b')
        }
      } else if (char === '\x1b' || char === '\x03') {
        // Escape or Ctrl+C - cancel
        process.stdin.removeListener('data', handler)
        process.stdin.on('data', pauseHandler)
        resolve('')
      } else if (char >= ' ') {
        buffer += char
        process.stdout.write(char)
      }
    }

    process.stdin.on('data', handler)
  })
}

/** Jump to next/prev search match. */
function jumpToMatch(state: PagerState, direction: 1 | -1): void {
  if (state.searchMatches.length === 0) return

  state.searchIndex += direction

  // Wrap around
  if (state.searchIndex >= state.searchMatches.length) {
    state.searchIndex = 0
  } else if (state.searchIndex < 0) {
    state.searchIndex = state.searchMatches.length - 1
  }

  const match = state.searchMatches[state.searchIndex]!
  goTo(state, match.lineIndex)
}

/** Get indices of all header lines. */
function getHeaderIndices(state: PagerState): number[] {
  const indices: number[] = []
  for (let i = 0; i < state.lines.length; i++) {
    if (state.lines[i]!.headerLevel !== undefined) {
      indices.push(i)
    }
  }
  return indices
}

export type AncestorHeader = { lineIndex: number; level: number; content: string }

/**
 * Find ancestor headers for the current viewport position.
 * Returns headers from H1 down to the parent of the current section.
 */
export function findAncestorHeaders(state: PagerState): AncestorHeader[] {
  const ancestors: AncestorHeader[] = []
  const { lines, topLine } = state

  // Find the current section's header (at or before topLine)
  let currentLevel = 7 // Start above max level

  // Scan backwards from topLine to find ancestor headers
  for (let i = topLine; i >= 0; i--) {
    const line = lines[i]!
    if (line.headerLevel !== undefined && line.headerLevel < currentLevel) {
      ancestors.unshift({
        lineIndex: i,
        level: line.headerLevel,
        content: line.content,
      })
      currentLevel = line.headerLevel
      if (currentLevel === 1) break // Found H1, done
    }
  }

  return ancestors
}

/** Render sticky header area. Returns number of rows used. */
function renderStickyHeaders(state: PagerState): number {
  const ancestors = findAncestorHeaders(state)
  if (ancestors.length === 0) return 0

  // Don't show sticky if topLine IS a header (it's already visible)
  const topLineHeader = state.lines[state.topLine]?.headerLevel
  if (topLineHeader !== undefined) {
    // Filter out the header at topLine itself
    const filtered = ancestors.filter(h => h.lineIndex !== state.topLine)
    if (filtered.length === 0) return 0
    return renderStickyArea(filtered, state.termWidth)
  }

  return renderStickyArea(ancestors, state.termWidth)
}

function renderStickyArea(headers: AncestorHeader[], termWidth: number): number {
  for (const header of headers) {
    process.stdout.write(colors.dim(header.content) + '\n')
  }
  // Separator line
  process.stdout.write(colors.dim('─'.repeat(termWidth)) + '\n')
  return headers.length + 1 // headers + separator
}

/** Jump to next/prev header. */
function jumpToHeader(state: PagerState, direction: 1 | -1): void {
  const headers = getHeaderIndices(state)
  if (headers.length === 0) return

  if (direction === 1) {
    // If at top, skip first header (already viewing it)
    const candidates = state.topLine === 0 ? headers.slice(1) : headers
    const next = candidates.find(i => i > state.topLine)
    if (next !== undefined) state.topLine = next
  } else {
    const prev = headers.findLast(i => i < state.topLine)
    if (prev !== undefined) state.topLine = prev
  }
}

/** Show info on prompt line. */
function showInfo(state: PagerState): void {
  const info = formatInfo(state)
  process.stdout.write(ANSI.cursorTo(state.termHeight, 1) + ANSI.eraseLine + info)
}

/** Format image placeholder with left-side border. */
function formatImageBox(alt: string): { output: string; rows: number } {
  const TAB = '  '
  const top = colors.dim(`${TAB}┌─ Image`)
  const content = `${colors.dim(`${TAB}│`)}  ${colors.imageLabel(alt)}`
  const bottom = colors.dim(`${TAB}└─`)

  const output = `${top}\n${content}\n${bottom}\n`
  return { output, rows: 3 }
}
