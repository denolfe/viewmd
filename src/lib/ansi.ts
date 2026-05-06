// Combined regex for stripping ANSI: SGR codes + OSC 8 hyperlinks
const ANSI_REGEX = /\x1b\[[0-9;]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g

/** ANSI escape sequences for terminal control. */
export const ANSI = {
  clearScreen: '\x1b[2J',
  cursorHome: '\x1b[H',
  cursorHide: '\x1b[?25l',
  cursorShow: '\x1b[?25h',
  cursorTo: (row: number, col: number) => `\x1b[${row};${col}H`,
  eraseLine: '\x1b[2K',
  highlightStart: '\x1b[7m', // Inverse video
  highlightEnd: '\x1b[27m',
  mouseOn: '\x1b[?1000h\x1b[?1006h', // Enable SGR mouse mode
  mouseOff: '\x1b[?1000l\x1b[?1006l', // Disable SGR mouse mode
} as const

/** Strip ANSI escape codes from string. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_REGEX, '')
}

/** Get visible length of string (excluding ANSI codes). */
export function visibleLength(s: string): number {
  return stripAnsi(s).length
}

/**
 * Build map from visible character index to ANSI string index.
 * Returns array where map[visibleIdx] = ansiIdx.
 */
export function buildPositionMap(s: string): number[] {
  const map: number[] = []
  let visibleIdx = 0
  let i = 0

  while (i < s.length) {
    // Check for SGR escape sequence
    const sgrMatch = s.slice(i).match(/^\x1b\[[0-9;]*m/)
    if (sgrMatch) {
      i += sgrMatch[0].length
      continue
    }
    // Check for OSC 8 hyperlink sequence
    const osc8Match = s.slice(i).match(/^\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/)
    if (osc8Match) {
      i += osc8Match[0].length
      continue
    }
    map[visibleIdx] = i
    visibleIdx++
    i++
  }

  return map
}

/** Inject highlight (inverse video) around visible character range. */
export function injectHighlight(params: {
  /** String possibly containing ANSI codes */
  str: string
  /** Start visible index (inclusive) */
  start: number
  /** End visible index (exclusive) */
  end: number
}): string {
  const { str, start, end } = params
  const map = buildPositionMap(str)
  if (start >= map.length || end > map.length) return str

  const ansiStart = map[start]!
  const ansiEnd = end < map.length ? map[end]! : str.length

  return (
    str.slice(0, ansiStart) +
    ANSI.highlightStart +
    str.slice(ansiStart, ansiEnd) +
    ANSI.highlightEnd +
    str.slice(ansiEnd)
  )
}
