import { visibleLength } from './ansi'
import { HEADING_MARKER } from './renderers'

export type Line = {
  content: string
  imageRef?: string
  headerLevel?: number
}

// Match placeholder with optional surrounding ANSI codes/whitespace
const IMAGE_PLACEHOLDER_REGEX = /^(?:\x1b\[[0-9;]*m|\s)*(\x00IMG:\d+\x00)(?:\x1b\[[0-9;]*m|\s)*$/

/**
 * Wrap a single line to fit within width, preserving ANSI codes.
 * Wraps at word boundaries when possible.
 * Returns array of wrapped line segments.
 */
export function wrapLine(line: string, width: number): string[] {
  const visLen = visibleLength(line)
  if (visLen <= width) return [line]

  const result: string[] = []
  let remaining = line
  let activeAnsi = '' // Track active ANSI codes to reapply

  while (visibleLength(remaining) > width) {
    let chunk = ''
    let visibleCount = 0
    let i = 0
    let lastSpaceIdx = -1
    let lastSpaceChunkLen = 0
    let lastSpaceVisCount = 0

    while (i < remaining.length && visibleCount < width) {
      const match = remaining.slice(i).match(/^\x1b\[[0-9;]*m/)
      if (match) {
        activeAnsi = match[0]
        chunk += match[0]
        i += match[0].length
      } else {
        if (remaining[i] === ' ') {
          lastSpaceIdx = i
          lastSpaceChunkLen = chunk.length + 1
          lastSpaceVisCount = visibleCount + 1
        }
        chunk += remaining[i]
        visibleCount++
        i++
      }
    }

    // If we found a space and it's not at the very start, wrap there
    if (lastSpaceIdx > 0 && lastSpaceVisCount < visibleCount) {
      chunk = chunk.slice(0, lastSpaceChunkLen - 1) // Exclude the space
      i = lastSpaceIdx + 1 // Skip the space
    }

    result.push(chunk)
    remaining = activeAnsi + remaining.slice(i)
  }

  if (remaining) result.push(remaining)
  return result
}

/**
 * Split rendered content into Line objects for pager display.
 * Handles newlines, word wrapping, image placeholder detection, and header markers.
 */
export function splitIntoLines(content: string, width: number): Line[] {
  const rawLines = content.split('\n')
  const result: Line[] = []

  for (let raw of rawLines) {
    // Check for image placeholder
    const imageMatch = raw.match(IMAGE_PLACEHOLDER_REGEX)
    if (imageMatch) {
      result.push({ content: raw, imageRef: imageMatch[1] })
      continue
    }

    // Check for header marker (format: \x01{level})
    let headerLevel: number | undefined
    if (raw.startsWith(HEADING_MARKER)) {
      headerLevel = parseInt(raw[1]!, 10)
      raw = raw.slice(2) // Skip marker + level digit
    }

    // Wrap long lines - only first segment keeps headerLevel
    const wrapped = wrapLine(raw, width)
    for (let i = 0; i < wrapped.length; i++) {
      result.push({ content: wrapped[i]!, headerLevel: i === 0 ? headerLevel : undefined })
    }
  }

  return result
}
