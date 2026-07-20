import { openSync, closeSync } from 'node:fs'
import type { CliRenderer } from '@opentui/core'

export function resolveEditorCommand(env: NodeJS.ProcessEnv): string {
  return env.VIEWMD_EDITOR_COMMAND?.trim() || env.EDITOR?.trim() || 'vi'
}

export function buildEditorArgv(params: { command: string; filePath: string }): string[] {
  const tokens = tokenize(params.command)
  if (tokens.length === 0) return ['vi', params.filePath]
  const hasPlaceholder = tokens.some(t => t.includes('{file}'))
  if (hasPlaceholder) return tokens.map(t => t.replaceAll('{file}', params.filePath))
  return [...tokens, params.filePath]
}

type SpawnSyncFn = (
  cmd: string[],
  options: {
    stdin: number | 'inherit'
    stdout: number | 'inherit'
    stderr: number | 'inherit'
  },
) => { exitCode: number | null }

export type EditorResult = { ok: true; code: number } | { ok: false; error: string }

// `spawnSync` is injected so the suspend/resume contract is unit-testable without
// launching a real process. Production callers omit it and get Bun.spawnSync.
export function openInEditor(params: {
  renderer: CliRenderer
  argv: string[]
  spawnSync?: SpawnSyncFn
}): EditorResult {
  const spawnSync = params.spawnSync ?? defaultSpawnSync
  // Bind the child to /dev/tty so the editor owns the terminal even when viewmd's
  // own stdin is a pipe (the /dev/tty keyboard-fallback launch mode).
  let ttyFd: number | null = null
  try {
    ttyFd = openSync('/dev/tty', 'r+')
  } catch {
    ttyFd = null
  }
  const fd: number | 'inherit' = ttyFd ?? 'inherit'
  params.renderer.suspend()
  try {
    const { exitCode } = spawnSync(params.argv, { stdin: fd, stdout: fd, stderr: fd })
    return { ok: true, code: exitCode ?? 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    if (ttyFd !== null) closeSync(ttyFd)
    params.renderer.resume()
  }
}

const defaultSpawnSync: SpawnSyncFn = (cmd, options) => Bun.spawnSync(cmd, options)

// Whitespace-split honoring single/double quotes. No shell expansion (no glob,
// no $VAR) — keeps spawning predictable and safe.
function tokenize(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let hasToken = false
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      hasToken = true
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (hasToken) tokens.push(current)
      current = ''
      hasToken = false
      continue
    }
    current += ch
    hasToken = true
  }
  if (hasToken) tokens.push(current)
  return tokens
}
