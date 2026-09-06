import { describe, expect, test } from 'bun:test'
import type { BenchResult, HyperfineReport } from './bench-compare'
import { FAIL_RATIO, WARN_RATIO, compareAll, renderTable } from './bench-compare'

function pair(doc: string, baselineMean: number, prMean: number): BenchResult[] {
  return [
    {
      command: `baseline/dist/bin/viewmd --render ${doc}`,
      mean: baselineMean,
      stddev: 0.01,
      parameters: { doc },
    },
    {
      command: `dist/bin/viewmd --render ${doc}`,
      mean: prMean,
      stddev: 0.008,
      parameters: { doc },
    },
  ]
}

function report(baselineMean: number, prMean: number): HyperfineReport {
  return { results: pair('README.md', baselineMean, prMean) }
}

const only = (r: HyperfineReport) => {
  const [c] = compareAll(r)
  if (!c) throw new Error('no comparison')
  return c
}

describe('compareAll', () => {
  test('ok when PR is within 10% of baseline', () => {
    const c = only(report(0.534, 0.56))
    expect(c.verdict).toBe('ok')
    expect(c.ratio).toBeCloseTo(1.0487, 3)
  })

  test('ok when PR is faster than baseline (bootstrap case)', () => {
    expect(only(report(0.534, 0.28)).verdict).toBe('ok')
  })

  test('warn at exactly the warn threshold', () => {
    expect(only(report(1.0, WARN_RATIO)).verdict).toBe('warn')
  })

  test('warn between thresholds', () => {
    expect(only(report(0.534, 0.534 * 1.15)).verdict).toBe('warn')
  })

  test('fail at exactly the fail threshold', () => {
    expect(only(report(1.0, FAIL_RATIO)).verdict).toBe('fail')
  })

  test('fail above the fail threshold', () => {
    expect(only(report(0.534, 0.534 * 1.5)).verdict).toBe('fail')
  })

  test('one comparison per doc parameter, in hyperfine order', () => {
    const cs = compareAll({
      results: [
        ...pair('test/exhaustive.md', 0.5, 0.5),
        ...pair('bench/large.md', 1.0, 1.3),
        ...pair('bench/huge.md', 2.0, 2.3),
      ],
    })
    expect(cs.map(c => c.doc)).toEqual(['test/exhaustive.md', 'bench/large.md', 'bench/huge.md'])
    expect(cs.map(c => c.verdict)).toEqual(['ok', 'fail', 'warn'])
  })

  test('a report without parameters is a single unnamed pair', () => {
    const cs = compareAll({
      results: [
        { command: 'baseline', mean: 1, stddev: 0 },
        { command: 'pr', mean: 1, stddev: 0 },
      ],
    })
    expect(cs).toHaveLength(1)
    expect(cs[0]?.doc).toBe('')
  })

  test('throws on non-numeric means instead of passing', () => {
    const bad = report(0.534, 0.28)
    const pr = bad.results[1]
    if (pr) pr.mean = Number.NaN
    expect(() => compareAll(bad)).toThrow('Non-finite ratio')
  })

  test('throws when a doc does not have exactly two results', () => {
    expect(() => compareAll({ results: [] })).toThrow()
    expect(() => compareAll({ results: pair('a.md', 1, 1).slice(0, 1) })).toThrow('"a.md"')
  })
})

describe('renderTable', () => {
  test('renders label, doc, ms means, ratio, and verdict emoji', () => {
    const table = renderTable({
      comparisons: compareAll(report(0.534, 0.28)),
      baselineLabel: 'main@abc1234',
    })
    expect(table).toContain('main@abc1234')
    expect(table).toContain('| README.md |')
    expect(table).toContain('534.0ms ± 10.0ms')
    expect(table).toContain('280.0ms ± 8.0ms')
    expect(table).toContain('0.52×')
    expect(table).toContain('✅')
  })

  test('renders one row per doc and ❌ for fail', () => {
    const table = renderTable({
      comparisons: compareAll({
        results: [...pair('a.md', 0.5, 0.5), ...pair('b.md', 0.5, 0.7)],
      }),
      baselineLabel: 'main@abc1234',
    })
    expect(table).toContain('| a.md |')
    expect(table).toContain('| b.md |')
    expect(table).toContain('❌')
  })
})
