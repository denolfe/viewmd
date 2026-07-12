import { describe, expect, test } from 'bun:test'
import { binPath, evaluateRun, runOnce } from './smoke-bin'
import { hostPlatform } from './platforms'

const okRun = { exitCode: 0, stdoutBytes: 1234, durationMs: 300, timedOut: false, stderr: '' }

describe('binPath', () => {
  test('resolves to dist/bin/<host binName>', () => {
    expect(binPath()).toBe(`dist/bin/${hostPlatform().binName}`)
  })
})

describe('evaluateRun', () => {
  test('passes a fast, clean run', () => {
    expect(evaluateRun({ run: okRun, ceilingMs: 2000 })).toEqual({ ok: true })
  })

  test('fails a timed-out run as SMOKE_TIMEOUT', () => {
    const verdict = evaluateRun({ run: { ...okRun, timedOut: true }, ceilingMs: 2000 })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('SMOKE_TIMEOUT')
  })

  test('fails a non-zero exit', () => {
    const verdict = evaluateRun({ run: { ...okRun, exitCode: 1 }, ceilingMs: 2000 })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('exit=1')
  })

  test('fails empty stdout', () => {
    const verdict = evaluateRun({ run: { ...okRun, stdoutBytes: 0 }, ceilingMs: 2000 })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('empty stdout')
  })

  test('fails a warm run over the ceiling as SMOKE_SLOW', () => {
    const verdict = evaluateRun({ run: { ...okRun, durationMs: 2500 }, ceilingMs: 2000 })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('SMOKE_SLOW')
  })

  test('ignores duration when ceiling is Infinity (cold run)', () => {
    const run = { ...okRun, durationMs: 25_000 }
    expect(evaluateRun({ run, ceilingMs: Number.POSITIVE_INFINITY })).toEqual({ ok: true })
  })
})

describe('runOnce', () => {
  test('kills a hanging process and reports timedOut', async () => {
    const result = await runOnce({
      cmd: [process.execPath, '-e', 'await new Promise(() => {})'],
      timeoutMs: 250,
    })
    expect(result.timedOut).toBe(true)
  })

  test('captures exit code and stdout bytes of a clean process', async () => {
    const result = await runOnce({
      cmd: [process.execPath, '-e', 'console.log("hello")'],
      timeoutMs: 10_000,
    })
    expect(result.exitCode).toBe(0)
    expect(result.timedOut).toBe(false)
    expect(result.stdoutBytes).toBeGreaterThan(0)
  })
})
