import { describe, expect, test } from 'bun:test'
import type { HyperfineReport, MetricSet } from './bench-compare'
import {
  FAIL_RATIO,
  WARN_RATIO,
  compare,
  compareMetrics,
  overallVerdict,
  renderMetricTable,
  renderTable,
  verdictFor,
} from './bench-compare'

function report(baselineMean: number, prMean: number): HyperfineReport {
  return {
    results: [
      {
        command: 'baseline/package/bin/viewmd --render README.md',
        mean: baselineMean,
        stddev: 0.01,
      },
      { command: 'dist/bin/viewmd --render README.md', mean: prMean, stddev: 0.008 },
    ],
  }
}

describe('compare', () => {
  test('ok when PR is within 10% of baseline', () => {
    const c = compare(report(0.534, 0.56))
    expect(c.verdict).toBe('ok')
    expect(c.ratio).toBeCloseTo(1.0487, 3)
  })

  test('ok when PR is faster than baseline (bootstrap case)', () => {
    expect(compare(report(0.534, 0.28)).verdict).toBe('ok')
  })

  test('warn at exactly the warn threshold', () => {
    expect(compare(report(1.0, WARN_RATIO)).verdict).toBe('warn')
  })

  test('warn between thresholds', () => {
    expect(compare(report(0.534, 0.534 * 1.15)).verdict).toBe('warn')
  })

  test('fail at exactly the fail threshold', () => {
    expect(compare(report(1.0, FAIL_RATIO)).verdict).toBe('fail')
  })

  test('fail above the fail threshold', () => {
    expect(compare(report(0.534, 0.534 * 1.5)).verdict).toBe('fail')
  })

  test('throws on non-numeric means instead of passing', () => {
    const bad = report(0.534, 0.28)
    bad.results[1] = { command: 'pr', mean: Number.NaN, stddev: 0 }
    expect(() => compare(bad)).toThrow('Non-finite ratio')
  })

  test('throws when the report does not contain exactly two results', () => {
    expect(() => compare({ results: [] })).toThrow()
  })
})

describe('renderTable', () => {
  test('renders label, ms means, ratio, and verdict emoji', () => {
    const table = renderTable({
      comparison: compare(report(0.534, 0.28)),
      baselineLabel: 'main@abc1234',
    })
    expect(table).toContain('main@abc1234')
    expect(table).toContain('534.0ms ± 10.0ms')
    expect(table).toContain('280.0ms ± 8.0ms')
    expect(table).toContain('0.52×')
    expect(table).toContain('✅')
  })

  test('renders ❌ for fail', () => {
    const table = renderTable({
      comparison: compare(report(0.5, 0.7)),
      baselineLabel: 'main@abc1234',
    })
    expect(table).toContain('❌')
  })
})

function metricSet(metrics: Record<string, number>): MetricSet {
  return { metrics }
}

describe('verdictFor', () => {
  test('ok / warn / fail at the thresholds', () => {
    expect(verdictFor(1.0)).toBe('ok')
    expect(verdictFor(WARN_RATIO)).toBe('warn')
    expect(verdictFor(FAIL_RATIO)).toBe('fail')
  })

  test('throws on a non-finite ratio', () => {
    expect(() => verdictFor(Number.NaN)).toThrow('Non-finite ratio')
  })
})

describe('compareMetrics', () => {
  test('diffs each shared metric and classifies it', () => {
    const cs = compareMetrics({
      baseline: metricSet({ step_p50: 10, full_mount: 100 }),
      pr: metricSet({ step_p50: 13, full_mount: 105 }),
    })
    expect(cs).toHaveLength(2)
    const step = cs.find(c => c.name === 'step_p50')
    expect(step?.ratio).toBeCloseTo(1.3, 5)
    expect(step?.verdict).toBe('fail')
    expect(cs.find(c => c.name === 'full_mount')?.verdict).toBe('ok')
  })

  test('throws when the baseline has no metrics', () => {
    expect(() => compareMetrics({ baseline: metricSet({}), pr: metricSet({}) })).toThrow(
      'no metrics',
    )
  })

  test('throws when the PR is missing a baseline metric', () => {
    expect(() =>
      compareMetrics({ baseline: metricSet({ step_p50: 10 }), pr: metricSet({ other: 5 }) }),
    ).toThrow('Missing metric')
  })
})

describe('overallVerdict', () => {
  test('is the worst verdict across comparisons', () => {
    expect(
      overallVerdict(
        compareMetrics({ baseline: metricSet({ a: 10, b: 10 }), pr: metricSet({ a: 10, b: 15 }) }),
      ),
    ).toBe('fail')
    expect(
      overallVerdict(
        compareMetrics({
          baseline: metricSet({ a: 10, b: 10 }),
          pr: metricSet({ a: 10, b: 11.5 }),
        }),
      ),
    ).toBe('warn')
    expect(
      overallVerdict(compareMetrics({ baseline: metricSet({ a: 10 }), pr: metricSet({ a: 9 }) })),
    ).toBe('ok')
  })
})

describe('renderMetricTable', () => {
  test('renders a titled row per metric with ms, ratio, and emoji', () => {
    const table = renderMetricTable({
      title: 'Scroll (large.md)',
      comparisons: compareMetrics({
        baseline: metricSet({ step_p50: 10 }),
        pr: metricSet({ step_p50: 13 }),
      }),
      baselineLabel: 'main@abc1234',
    })
    expect(table).toContain('### Scroll (large.md)')
    expect(table).toContain('main@abc1234')
    expect(table).toContain('step_p50')
    expect(table).toContain('10.0ms')
    expect(table).toContain('13.0ms')
    expect(table).toContain('1.30×')
    expect(table).toContain('❌')
  })
})
