import type { Hint, HintGroup } from './keys'

export const GROUP_ORDER: HintGroup[] = ['General', 'Navigation', 'Search', 'TOC & Sidebar']

export type HintSection = { group: HintGroup; hints: Hint[] }

/** Groups hints in canonical order, dropping groups with no hints. */
export function groupHints(hints: Hint[]): HintSection[] {
  return GROUP_ORDER.map(group => ({
    group,
    hints: hints.filter(h => h.group === group),
  })).filter(s => s.hints.length > 0)
}

/**
 * Lays the sections out in one or two columns (kept whole, canonical order). Uses
 * two balanced columns whenever `twoColumns` is set and there are at least two
 * sections — so a wide terminal fills its horizontal space instead of running one
 * tall column. Otherwise a single column. The split fills the left column to
 * roughly half the total rows, then the rest go right.
 */
export function layoutColumns(sections: HintSection[], twoColumns: boolean): HintSection[][] {
  if (!twoColumns || sections.length < 2) return [sections]

  const total = sections.reduce((n, s) => n + sectionRows(s), 0)
  const target = Math.ceil(total / 2)
  const left: HintSection[] = []
  const right: HintSection[] = []
  let used = 0
  for (const s of sections) {
    if (right.length === 0 && used < target) {
      left.push(s)
      used += sectionRows(s)
    } else {
      right.push(s)
    }
  }
  return right.length > 0 ? [left, right] : [left]
}

// A section draws one label row plus one row per hint.
const sectionRows = (s: HintSection): number => 1 + s.hints.length
