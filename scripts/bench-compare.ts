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

/** Classify a PR/baseline ratio (higher = slower = worse) against the thresholds. */
export function verdictFor(ratio: number): Verdict {
  if (!Number.isFinite(ratio)) {
    throw new Error(`Non-finite ratio ${ratio}`)
  }
  if (ratio >= FAIL_RATIO) return 'fail'
  if (ratio >= WARN_RATIO) return 'warn'
  return 'ok'
}

/** Expects exactly two results: baseline first, PR second (hyperfine arg order). */
export function compare(report: HyperfineReport): Comparison {
  const [baseline, pr] = report.results
  if (report.results.length !== 2 || !baseline || !pr) {
    throw new Error(`Expected exactly 2 hyperfine results, got ${report.results.length}`)
  }
  const ratio = pr.mean / baseline.mean
  return { baseline, pr, ratio, verdict: verdictFor(ratio) }
}

/** A harness JSON payload: named ms metrics plus arbitrary context fields. */
export type MetricSet = {
  metrics: Record<string, number>
  [key: string]: unknown
}

export type MetricComparison = {
  name: string
  baseline: number
  pr: number
  ratio: number
  verdict: Verdict
}

/** Diff every metric in the baseline payload against the PR payload (ms, higher = worse). */
export function compareMetrics(params: { baseline: MetricSet; pr: MetricSet }): MetricComparison[] {
  const { baseline, pr } = params
  const names = Object.keys(baseline.metrics)
  if (names.length === 0) throw new Error('Baseline payload has no metrics')
  return names.map(name => {
    const b = baseline.metrics[name]
    const p = pr.metrics[name]
    if (typeof b !== 'number' || typeof p !== 'number') {
      throw new Error(`Missing metric "${name}" in baseline or PR payload`)
    }
    const ratio = p / b
    return { name, baseline: b, pr: p, ratio, verdict: verdictFor(ratio) }
  })
}

/** Worst verdict across a set of comparisons; drives the process exit code. */
export function overallVerdict(comparisons: MetricComparison[]): Verdict {
  if (comparisons.some(c => c.verdict === 'fail')) return 'fail'
  if (comparisons.some(c => c.verdict === 'warn')) return 'warn'
  return 'ok'
}

const EMOJI: Record<Verdict, string> = { ok: '✅', warn: '⚠️', fail: '❌' }

export function renderMetricTable(params: {
  title: string
  comparisons: MetricComparison[]
  baselineLabel: string
}): string {
  const { title, comparisons, baselineLabel } = params
  const lines = [
    `### ${title}`,
    '',
    `| metric | baseline (${baselineLabel}) | PR | ratio | verdict |`,
    '| --- | --- | --- | --- | --- |',
    ...comparisons.map(
      c =>
        `| ${c.name} | ${c.baseline.toFixed(1)}ms | ${c.pr.toFixed(1)}ms | ${c.ratio.toFixed(2)}× | ${EMOJI[c.verdict]} ${c.verdict} |`,
    ),
    '',
    `Thresholds: warn ≥ ${WARN_RATIO}×, fail ≥ ${FAIL_RATIO}×. Baseline built from main.`,
  ]
  return lines.join('\n')
}

export function renderTable(params: { comparison: Comparison; baselineLabel: string }): string {
  const { comparison, baselineLabel } = params
  const lines = [
    '### Startup benchmark (`--render test/exhaustive.md`, linux-x64)',
    '',
    '| build | mean | ratio | verdict |',
    '| --- | --- | --- | --- |',
    `| baseline (${baselineLabel}) | ${ms(comparison.baseline)} | — | |`,
    `| PR | ${ms(comparison.pr)} | ${comparison.ratio.toFixed(2)}× | ${EMOJI[comparison.verdict]} ${comparison.verdict} |`,
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
      append: { type: 'boolean', default: false },
      metrics: { type: 'string' },
    },
  })
  const baselineLabel = values['baseline-label']
  if (!baselineLabel) throw new Error('--baseline-label is required')

  const table = values.metrics
    ? await metricTable({ title: values.metrics, positionals, baselineLabel })
    : await hyperfineTable({ path: positionals[0], baselineLabel })

  console.log(table.text)
  if (values.out) await writeOut({ path: values.out, text: table.text, append: values.append })
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table.text}\n`)
  }
  if (table.verdict === 'fail') process.exit(1)
}

async function hyperfineTable(params: {
  path: string | undefined
  baselineLabel: string
}): Promise<{ text: string; verdict: Verdict }> {
  const { path, baselineLabel } = params
  if (!path) {
    throw new Error('Usage: bench-compare.ts <hyperfine.json> --baseline-label <label> [--out <f>]')
  }
  const report: HyperfineReport = await Bun.file(path).json()
  const comparison = compare(report)
  return { text: renderTable({ comparison, baselineLabel }), verdict: comparison.verdict }
}

async function metricTable(params: {
  title: string
  positionals: string[]
  baselineLabel: string
}): Promise<{ text: string; verdict: Verdict }> {
  const { title, positionals, baselineLabel } = params
  const [baselinePath, prPath] = positionals
  if (!baselinePath || !prPath) {
    throw new Error(
      'Usage: bench-compare.ts --metrics <title> <baseline.json> <pr.json> --baseline-label <label>',
    )
  }
  const baseline: MetricSet = await Bun.file(baselinePath).json()
  const pr: MetricSet = await Bun.file(prPath).json()
  const comparisons = compareMetrics({ baseline, pr })
  return {
    text: renderMetricTable({ title, comparisons, baselineLabel }),
    verdict: overallVerdict(comparisons),
  }
}

async function writeOut(params: { path: string; text: string; append: boolean }): Promise<void> {
  const { path, text, append } = params
  if (append) {
    appendFileSync(path, `\n${text}\n`)
    return
  }
  await Bun.write(path, text)
}

function ms(result: BenchResult): string {
  return `${(result.mean * 1000).toFixed(1)}ms ± ${(result.stddev * 1000).toFixed(1)}ms`
}
