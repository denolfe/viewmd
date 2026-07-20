import { openSync, closeSync, accessSync, constants } from 'node:fs'
import { basename } from 'node:path'
import type { CliRenderer } from '@opentui/core'

export function resolveEditorCommand(env: NodeJS.ProcessEnv): string {
  return env.VIEWMD_EDITOR_COMMAND?.trim() || env.EDITOR?.trim() || 'vi'
}

export function buildEditorArgv(params: {
  command: string
  filePath: string
  line?: number
}): string[] {
  const tokens = tokenize(params.command)
  if (tokens.length === 0) return ['vi', params.filePath]
  const hasPlaceholder = tokens.some(t => t.includes('{file}') || t.includes('{line}'))
  if (hasPlaceholder) {
    const lineStr = params.line === undefined ? '' : String(params.line)
    return tokens.map(t => t.replaceAll('{file}', params.filePath).replaceAll('{line}', lineStr))
  }
  if (params.line === undefined) return [...tokens, params.filePath]
  return appendFileWithLine({ tokens, filePath: params.filePath, line: params.line })
}

// Editor basename → native line-positioning syntax. Unknown editors fall back to
// the POSIX `+N file` convention (matches our default `vi`).
function appendFileWithLine(params: {
  tokens: string[]
  filePath: string
  line: number
}): string[] {
  const { tokens, filePath, line } = params
  const raw = basename(tokens[0] ?? '').toLowerCase()
  const name = raw.endsWith('.exe') ? raw.slice(0, -'.exe'.length) : raw

  const vscode = new Set(['code', 'code-insiders', 'codium', 'vscodium', 'code-oss'])
  const fileColonLine = new Set(['subl', 'sublime_text', 'smerge', 'hx', 'helix'])
  const jetbrains = new Set([
    'idea',
    'pycharm',
    'webstorm',
    'goland',
    'clion',
    'rider',
    'phpstorm',
    'rubymine',
    'datagrip',
  ])

  if (vscode.has(name)) return [...tokens, '-g', `${filePath}:${line}`]
  if (fileColonLine.has(name)) return [...tokens, `${filePath}:${line}`]
  if (jetbrains.has(name)) return [...tokens, '--line', String(line), filePath]
  if (name === 'mate') return [...tokens, '-l', String(line), filePath]
  // `+N file` for the +N family (vi/vim/nvim/nano/emacs/…) and every unknown editor.
  return [...tokens, `+${line}`, filePath]
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

type IsExecutableFn = (command: string) => boolean

// `spawnSync`/`isExecutable` are injected so the suspend/resume contract is
// unit-testable without launching a real process. Production callers omit them.
export function openInEditor(params: {
  renderer: CliRenderer
  argv: string[]
  spawnSync?: SpawnSyncFn
  isExecutable?: IsExecutableFn
}): EditorResult {
  const spawnSync = params.spawnSync ?? defaultSpawnSync
  const isExecutable = params.isExecutable ?? defaultIsExecutable
  // Resolve the binary *before* suspending the renderer. A bogus command
  // otherwise triggers a suspend → spawn-throw → resume cycle that tears down
  // and repaints the alt-screen for a frame — a visible flicker. Bailing here
  // flashes the error without ever leaving the viewer.
  const bin = params.argv[0]
  if (!bin || !isExecutable(bin)) {
    return { ok: false, error: `${bin ?? 'editor'}: command not found` }
  }
  // Bind the child to /dev/tty so the editor owns the terminal even when viewmd's
  // own stdin is a pipe (the /dev/tty keyboard-fallback launch mode).
  let ttyFd: number | null = null
  try {
    ttyFd = openSync('/dev/tty', 'r+')
  } catch {
    ttyFd = null
  }
  const fd: number | 'inherit' = ttyFd ?? 'inherit'
  try {
    params.renderer.suspend()
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

// A path (contains `/`) is checked directly for the executable bit; a bare name
// is resolved against PATH. No shell expansion — matches how we spawn.
const defaultIsExecutable: IsExecutableFn = command => {
  if (command.includes('/')) {
    try {
      accessSync(command, constants.X_OK)
      return true
    } catch {
      return false
    }
  }
  return Bun.which(command) !== null
}

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
