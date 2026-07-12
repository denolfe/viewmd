import { describe, expect, test } from 'bun:test'
import type { HyperfineReport } from './bench-compare'
import { FAIL_RATIO, WARN_RATIO, compare, renderTable } from './bench-compare'

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

  test('throws when the report does not contain exactly two results', () => {
    expect(() => compare({ results: [] })).toThrow()
  })
})

describe('renderTable', () => {
  test('renders version, ms means, ratio, and verdict emoji', () => {
    const table = renderTable({
      comparison: compare(report(0.534, 0.28)),
      baselineVersion: '0.1.0-beta.2',
    })
    expect(table).toContain('0.1.0-beta.2')
    expect(table).toContain('534.0ms ± 10.0ms')
    expect(table).toContain('280.0ms ± 8.0ms')
    expect(table).toContain('0.52×')
    expect(table).toContain('✅')
  })

  test('renders ❌ for fail', () => {
    const table = renderTable({ comparison: compare(report(0.5, 0.7)), baselineVersion: '0.1.0' })
    expect(table).toContain('❌')
  })
})
