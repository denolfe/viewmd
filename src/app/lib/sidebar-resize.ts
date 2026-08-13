/** Minimum sidebar width in columns (matches the existing auto-fit floor). */
export const MIN_TOC_WIDTH = 16
/** Columns the Viewer must always retain, capping how wide a manual drag can grow the sidebar. */
export const MIN_VIEWER_WIDTH = 20
/** Two `down` events within this window count as a double-click (reset). */
export const DOUBLE_CLICK_MS = 400

/**
 * Sidebar sits on the right, so its width is `termWidth - x` where `x` is the
 * absolute drag column. Clamped to keep the sidebar >= MIN_TOC_WIDTH and the
 * viewer >= MIN_VIEWER_WIDTH. On very narrow terminals the lower bound wins.
 */
export function sidebarWidthFromDragX({ x, termWidth }: { x: number; termWidth: number }): number {
  const raw = termWidth - x
  const max = Math.max(MIN_TOC_WIDTH, termWidth - MIN_VIEWER_WIDTH)
  return Math.min(max, Math.max(MIN_TOC_WIDTH, raw))
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
