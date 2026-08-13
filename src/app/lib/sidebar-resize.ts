import { VIEWER_OVERHEAD } from '../styles/layout'
import { MIN_CONTENT_WIDTH } from './config'

/** Two `down` events within this window count as a double-click (reset). */
export const DOUBLE_CLICK_MS = 400

/**
 * Content sits on the left starting at column 0; the sidebar seam (and the grab
 * handle) is at its right edge, `contentWidth + VIEWER_OVERHEAD`. So the content
 * width a drag to absolute column `x` asks for is `x - VIEWER_OVERHEAD`. Clamped
 * to keep content >= MIN_CONTENT_WIDTH and leave the auto-width TOC (`tocWidth`)
 * its columns; on very narrow terminals the lower bound wins.
 */
export function contentWidthFromSeamX({
  x,
  termWidth,
  tocWidth,
}: {
  x: number
  termWidth: number
  tocWidth: number
}): number {
  const raw = x - VIEWER_OVERHEAD
  const max = Math.max(MIN_CONTENT_WIDTH, termWidth - tocWidth - VIEWER_OVERHEAD)
  return Math.min(max, Math.max(MIN_CONTENT_WIDTH, raw))
}

/** True when `now` follows a recorded prior `down` within DOUBLE_CLICK_MS. */
export function isDoubleClick({
  now,
  lastDownAt,
}: {
  now: number
  lastDownAt: number | null
}): boolean {
  return lastDownAt !== null && now - lastDownAt <= DOUBLE_CLICK_MS
}
