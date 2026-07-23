import { describe, expect, test } from 'bun:test'
import { foldOffset, aboveOffset } from './heading-resolution'
import type { TocEntry } from './ast'

const toc: TocEntry[] = [
  {
    id: 'a',
    level: 1,
    text: 'A',
    inline: [],
    children: [
      {
        id: 'b',
        level: 2,
        text: 'B',
        inline: [],
        children: [{ id: 'c', level: 3, text: 'C', inline: [], children: [] }],
      },
    ],
  },
  { id: 'd', level: 1, text: 'D', inline: [], children: [] },
]

describe('foldOffset', () => {
  test('deepest heading: ancestor crumbs, self excluded', () => {
    // c(L3) under b(L2) under a(L1): a pill + b muted = 2 rows, c filtered.
    expect(foldOffset({ toc, id: 'c', historyDepth: 0 })).toBe(2)
  })

  test('top-level H1 heading: no ancestors -> 0', () => {
    expect(foldOffset({ toc, id: 'a', historyDepth: 0 })).toBe(0)
  })

  test('no H1: synth file row counts toward ancestor height', () => {
    const noH1Toc: TocEntry[] = [
      {
        id: 'y',
        level: 2,
        text: 'Y',
        inline: [],
        children: [{ id: 'z', level: 3, text: 'Z', inline: [], children: [] }],
      },
    ]
    expect(foldOffset({ toc: noH1Toc, id: 'z', fileLabel: 'README.md', historyDepth: 0 })).toBe(2)
  })

  test('back badge adds one row when history exists', () => {
    expect(foldOffset({ toc, id: 'c', historyDepth: 2 })).toBe(3)
  })
})

describe('aboveOffset', () => {
  test('includes the heading own crumb (differs from foldOffset by 1)', () => {
    // fold excludes self (2); above includes c -> 3.
    expect(aboveOffset({ toc, id: 'c' })).toBe(3)
    expect(aboveOffset({ toc, id: 'c' }) - foldOffset({ toc, id: 'c', historyDepth: 0 })).toBe(1)
  })

  test('top-level H1: only its own crumb -> 1', () => {
    expect(aboveOffset({ toc, id: 'a' })).toBe(1)
  })
})
