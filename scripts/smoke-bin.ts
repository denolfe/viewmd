#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { hostPlatform } from './platforms'

const RUN_TIMEOUT_MS = 30_000
// Order-of-magnitude guard only: legit warm runs reach ~2s on windows-latest
// (observed 705ms-2006ms across runs). Perf sensitivity lives in the bench job.
const WARM_CEILING_MS = 10_000
const DOC = 'test/exhaustive.md'

export type RunResult = {
  exitCode: number
  stdoutBytes: number
  durationMs: number
  timedOut: boolean
  stderr: string
}

export type SmokeVerdict = { ok: true } | { ok: false; reason: string }

export function binPath(): string {
  return `dist/bin/${hostPlatform().binName}`
}

/** Spawn cmd, kill it (SIGTERM then SIGKILL) if it outlives timeoutMs. */
export async function runOnce(params: { cmd: string[]; timeoutMs: number }): Promise<RunResult> {
  const start = performance.now()
  const proc = Bun.spawn(params.cmd, { stdout: 'pipe', stderr: 'pipe' })
  let timedOut = false
  const killTimer = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, params.timeoutMs)
  const forceKillTimer = setTimeout(() => proc.kill('SIGKILL'), params.timeoutMs + 2_000)
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  clearTimeout(killTimer)
  clearTimeout(forceKillTimer)
  return {
    exitCode,
    stdoutBytes: stdout.byteLength,
    durationMs: performance.now() - start,
    timedOut,
    stderr,
  }
}

/** ceilingMs is the loose wall-clock guard; pass Infinity to skip it (cold run). */
export function evaluateRun(params: { run: RunResult; ceilingMs: number }): SmokeVerdict {
  const { run, ceilingMs } = params
  if (run.timedOut) return { ok: false, reason: `SMOKE_TIMEOUT after ${RUN_TIMEOUT_MS}ms` }
  if (run.exitCode !== 0) return { ok: false, reason: `SMOKE_FAIL exit=${run.exitCode}` }
  if (run.stdoutBytes === 0) return { ok: false, reason: 'SMOKE_FAIL empty stdout' }
  if (run.durationMs > ceilingMs) {
    return {
      ok: false,
      reason: `SMOKE_SLOW ${Math.round(run.durationMs)}ms > ${ceilingMs}ms ceiling`,
    }
  }
  return { ok: true }
}

if (import.meta.main) {
  const bin = binPath()
  if (!existsSync(bin)) throw new Error(`Missing ${bin} — run \`bun run build:bin\` first`)

  // Cold run materializes the native lib + tree-sitter worker into the user
  // cache dir; bounded by the hang timeout but exempt from the warm ceiling.
  const cold = await runOnce({ cmd: [bin, '--render', DOC], timeoutMs: RUN_TIMEOUT_MS })
  assertOk(evaluateRun({ run: cold, ceilingMs: Number.POSITIVE_INFINITY }), cold)

  const warm = await runOnce({ cmd: [bin, '--render', DOC], timeoutMs: RUN_TIMEOUT_MS })
  assertOk(evaluateRun({ run: warm, ceilingMs: WARM_CEILING_MS }), warm)

  console.log(
    `SMOKE_OK cold=${Math.round(cold.durationMs)}ms warm=${Math.round(warm.durationMs)}ms`,
  )
}

// Surface stderr even on passing runs — a broken subsystem (e.g. the
// tree-sitter worker) can log errors while the render still exits 0.
function assertOk(verdict: SmokeVerdict, run: RunResult): void {
  if (run.stderr.length > 0) console.error(`SMOKE_STDERR:\n${run.stderr}`)
  if (verdict.ok) return
  throw new Error(verdict.reason)
}
