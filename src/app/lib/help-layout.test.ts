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
  test('one column when everything fits', () => {
    expect(layoutColumns(groupHints(HINTS), 100)).toHaveLength(1)
  })
  test('splits into two columns when height-constrained', () => {
    const sections = groupHints(HINTS)
    const cols = layoutColumns(sections, 5)
    expect(cols).toHaveLength(2)
    const placed = cols.reduce((n, col) => n + col.length, 0)
    expect(placed).toBe(sections.length)
  })
  test('keeps canonical order when a small section trails a large one', () => {
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
    // rows: A=1+3=4, B=1+5=6, C=1+2=3
    const sections = [mk('Navigation', 3), mk('Search', 5), mk('General', 2)]
    const cols = layoutColumns(sections, 5)
    expect(cols.flat().map(s => s.group)).toEqual(['Navigation', 'Search', 'General'])
  })
})
