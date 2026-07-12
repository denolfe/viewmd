#!/usr/bin/env bun
import { appendFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

export const WARN_RATIO = 1.1
export const FAIL_RATIO = 1.25

export type BenchResult = {
  command: string
  mean: number
  stddev: number
}

export type HyperfineReport = {
  results: BenchResult[]
}

export type Verdict = 'ok' | 'warn' | 'fail'

export type Comparison = {
  baseline: BenchResult
  pr: BenchResult
  ratio: number
  verdict: Verdict
}

/** Expects exactly two results: baseline first, PR second (hyperfine arg order). */
export function compare(report: HyperfineReport): Comparison {
  const [baseline, pr] = report.results
  if (report.results.length !== 2 || !baseline || !pr) {
    throw new Error(`Expected exactly 2 hyperfine results, got ${report.results.length}`)
  }
  const ratio = pr.mean / baseline.mean
  if (!Number.isFinite(ratio)) {
    throw new Error(`Non-finite ratio from means ${pr.mean} / ${baseline.mean}`)
  }
  if (ratio >= FAIL_RATIO) return { baseline, pr, ratio, verdict: 'fail' }
  if (ratio >= WARN_RATIO) return { baseline, pr, ratio, verdict: 'warn' }
  return { baseline, pr, ratio, verdict: 'ok' }
}

export function renderTable(params: { comparison: Comparison; baselineVersion: string }): string {
  const { comparison, baselineVersion } = params
  const emoji: Record<Verdict, string> = { ok: '✅', warn: '⚠️', fail: '❌' }
  const lines = [
    '### Startup benchmark (`--render README.md`, linux-x64)',
    '',
    '| build | mean | ratio | verdict |',
    '| --- | --- | --- | --- |',
    `| baseline v${baselineVersion} | ${ms(comparison.baseline)} | — | |`,
    `| PR | ${ms(comparison.pr)} | ${comparison.ratio.toFixed(2)}× | ${emoji[comparison.verdict]} ${comparison.verdict} |`,
    '',
    `Thresholds: warn ≥ ${WARN_RATIO}×, fail ≥ ${FAIL_RATIO}×. Baseline is the latest published release.`,
  ]
  return lines.join('\n')
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'baseline-version': { type: 'string' },
      out: { type: 'string' },
    },
  })
  const jsonPath = positionals[0]
  const baselineVersion = values['baseline-version']
  if (!jsonPath || !baselineVersion) {
    throw new Error(
      'Usage: bench-compare.ts <hyperfine.json> --baseline-version <v> [--out <file>]',
    )
  }

  const report: HyperfineReport = await Bun.file(jsonPath).json()
  const comparison = compare(report)
  const table = renderTable({ comparison, baselineVersion })

  console.log(table)
  if (values.out) await Bun.write(values.out, table)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`)

  if (comparison.verdict === 'fail') process.exit(1)
}

function ms(result: BenchResult): string {
  return `${(result.mean * 1000).toFixed(1)}ms ± ${(result.stddev * 1000).toFixed(1)}ms`
}
