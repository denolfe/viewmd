#!/usr/bin/env bun
import { appendFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

export const WARN_RATIO = 1.1
export const FAIL_RATIO = 1.25

export type BenchResult = {
  command: string
  mean: number
  stddev: number
  /** hyperfine `-L` values; `doc` names the fixture the command rendered. */
  parameters?: Record<string, string>
}

export type HyperfineReport = {
  results: BenchResult[]
}

export type Verdict = 'ok' | 'warn' | 'fail'

export type Comparison = {
  doc: string
  baseline: BenchResult
  pr: BenchResult
  ratio: number
  verdict: Verdict
}

/**
 * One comparison per `doc` parameter. hyperfine emits results parameter-outer,
 * command-inner, so within a doc the baseline (first command) precedes the PR.
 * Without parameters the whole report is a single unnamed pair.
 */
export function compareAll(report: HyperfineReport): Comparison[] {
  const byDoc = new Map<string, BenchResult[]>()
  for (const r of report.results) {
    const doc = r.parameters?.doc ?? ''
    byDoc.set(doc, [...(byDoc.get(doc) ?? []), r])
  }
  if (byDoc.size === 0) throw new Error('hyperfine report has no results')
  return [...byDoc].map(([doc, results]) => compare(doc, results))
}

function compare(doc: string, results: BenchResult[]): Comparison {
  const [baseline, pr] = results
  if (results.length !== 2 || !baseline || !pr) {
    throw new Error(`Expected exactly 2 hyperfine results for "${doc}", got ${results.length}`)
  }
  const ratio = pr.mean / baseline.mean
  if (!Number.isFinite(ratio)) {
    throw new Error(`Non-finite ratio from means ${pr.mean} / ${baseline.mean}`)
  }
  if (ratio >= FAIL_RATIO) return { doc, baseline, pr, ratio, verdict: 'fail' }
  if (ratio >= WARN_RATIO) return { doc, baseline, pr, ratio, verdict: 'warn' }
  return { doc, baseline, pr, ratio, verdict: 'ok' }
}

export function renderTable(params: { comparisons: Comparison[]; baselineLabel: string }): string {
  const { comparisons, baselineLabel } = params
  const emoji: Record<Verdict, string> = { ok: '✅', warn: '⚠️', fail: '❌' }
  const lines = [
    '### Startup benchmark (`--render`, linux-x64)',
    '',
    `| doc | baseline (${baselineLabel}) | PR | ratio | verdict |`,
    '| --- | --- | --- | --- | --- |',
    ...comparisons.map(
      c =>
        `| ${c.doc || '(default)'} | ${ms(c.baseline)} | ${ms(c.pr)} | ${c.ratio.toFixed(2)}× | ${emoji[c.verdict]} ${c.verdict} |`,
    ),
    '',
    `Thresholds: warn ≥ ${WARN_RATIO}×, fail ≥ ${FAIL_RATIO}×. Baseline built from main.`,
  ]
  return lines.join('\n')
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'baseline-label': { type: 'string' },
      out: { type: 'string' },
    },
  })
  const jsonPath = positionals[0]
  const baselineLabel = values['baseline-label']
  if (!jsonPath || !baselineLabel) {
    throw new Error(
      'Usage: bench-compare.ts <hyperfine.json> --baseline-label <label> [--out <file>]',
    )
  }

  const report: HyperfineReport = await Bun.file(jsonPath).json()
  const comparisons = compareAll(report)
  const table = renderTable({ comparisons, baselineLabel })

  console.log(table)
  if (values.out) await Bun.write(values.out, table)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`)

  if (comparisons.some(c => c.verdict === 'fail')) process.exit(1)
}

function ms(result: BenchResult): string {
  return `${(result.mean * 1000).toFixed(1)}ms ± ${(result.stddev * 1000).toFixed(1)}ms`
}
