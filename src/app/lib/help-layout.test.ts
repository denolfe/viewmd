import { describe, expect, test } from 'bun:test'
import { groupHints, layoutColumns, GROUP_ORDER } from './help-layout'
import type { HintSection } from './help-layout'
import { HINTS } from './keys'
import type { HintGroup } from './keys'

describe('groupHints', () => {
  test('orders sections canonically and drops empty groups', () => {
    const sections = groupHints(HINTS)
    expect(sections.map(s => s.group)).toEqual(GROUP_ORDER)
    for (const s of sections) expect(s.hints.length).toBeGreaterThan(0)
  })
})

describe('layoutColumns', () => {
  const mk = (group: HintGroup, n: number): HintSection => ({
    group,
    hints: Array.from({ length: n }, (_, i) => ({
      keys: `k${i}`,
      desc: 'd',
      group,
      focus: 'viewer',
      probes: [],
    })),
  })

  test('single column when two columns are disallowed (narrow terminal)', () => {
    expect(layoutColumns(groupHints(HINTS), false)).toHaveLength(1)
  })
  test('splits into two columns when allowed, placing every section', () => {
    const sections = groupHints(HINTS)
    const cols = layoutColumns(sections, true)
    expect(cols).toHaveLength(2)
    const placed = cols.reduce((n, col) => n + col.length, 0)
    expect(placed).toBe(sections.length)
  })
  test('stays single column when there is only one section', () => {
    expect(layoutColumns([mk('Navigation', 4)], true)).toHaveLength(1)
  })
  test('balances the columns by row count, keeping canonical order', () => {
    // rows: Nav=1+3=4, Search=1+3=4, General=1+2=3 → total 11, target 6.
    const sections = [mk('Navigation', 3), mk('Search', 3), mk('General', 2)]
    const cols = layoutColumns(sections, true)
    expect(cols[0]?.map(s => s.group)).toEqual(['Navigation', 'Search'])
    expect(cols[1]?.map(s => s.group)).toEqual(['General'])
    expect(cols.flat().map(s => s.group)).toEqual(['Navigation', 'Search', 'General'])
  })
})
