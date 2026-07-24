import type { Hint, HintGroup } from './keys'

export const GROUP_ORDER: HintGroup[] = ['Navigation', 'Search', 'TOC & Sidebar', 'General']

export type HintSection = { group: HintGroup; hints: Hint[] }

/** Groups hints in canonical order, dropping groups with no hints. */
export function groupHints(hints: Hint[]): HintSection[] {
  return GROUP_ORDER.map(group => ({
    group,
    hints: hints.filter(h => h.group === group),
  })).filter(s => s.hints.length > 0)
}

/**
 * Splits sections into one or two columns (kept whole, canonical order). Stays a
 * single column when everything fits within `maxRows`, or when `allowTwoColumns`
 * is false (the viewer is too narrow to split without cramping descriptions) — in
 * which case the column grows tall instead. When it does split, only the LEFT
 * column is bounded by `maxRows`; the right takes the remainder.
 */
export function layoutColumns(
  sections: HintSection[],
  maxRows: number,
  allowTwoColumns: boolean,
): HintSection[][] {
  const total = sections.reduce((n, s) => n + sectionRows(s), 0)
  if (total <= maxRows || !allowTwoColumns) return [sections]

  const left: HintSection[] = []
  const right: HintSection[] = []
  let used = 0
  for (const s of sections) {
    const rows = sectionRows(s)
    // Keep filling the left column until a section would overflow it; every
    // later section then goes right, preserving canonical reading order.
    if (right.length === 0 && (left.length === 0 || used + rows <= maxRows)) {
      left.push(s)
      used += rows
    } else {
      right.push(s)
    }
  }
  return right.length > 0 ? [left, right] : [left]
}

// A section draws one label row plus one row per hint.
const sectionRows = (s: HintSection): number => 1 + s.hints.length
