import { PILL_LEFT, PILL_RIGHT } from './visible-text'

/** Narrow port over the renderer's OSC 52 clipboard, so the copy path is testable. */
export type ClipboardPort = {
  isOsc52Supported: () => boolean
  copyToClipboardOSC52: (text: string) => boolean
}

/** Feeds `text` to `cmd` on stdin; resolves true when the command exits 0. */
export type CommandRunner = (params: { cmd: string[]; text: string }) => Promise<boolean>

export type CopyStrategy = { kind: 'command'; cmd: string[] } | { kind: 'osc52' } | { kind: 'none' }

export type CopyResult =
  | { kind: 'copied'; chars: number }
  | { kind: 'empty' }
  | { kind: 'unsupported' }
  | { kind: 'failed' }

type Env = Record<string, string | undefined>

/**
 * Picks the clipboard path once per session. A local clipboard command wins over
 * OSC 52 because a multiplexer can swallow the escape sequence while still
 * reporting success (tmux `set-clipboard external`), leaving nothing to detect.
 * Over SSH there is no local clipboard to write to, so OSC 52 is the only path.
 */
export function resolveCopyStrategy(params: {
  env: Env
  platform: string
  hasCommand: (bin: string) => boolean
  isOsc52Supported: boolean
}): CopyStrategy {
  const { env, platform, hasCommand, isOsc52Supported } = params
  const osc52: CopyStrategy = isOsc52Supported ? { kind: 'osc52' } : { kind: 'none' }
  if (isRemoteSession(env)) return osc52

  const cmd = clipboardCommand({ env, platform, hasCommand })
  return cmd ? { kind: 'command', cmd } : osc52
}

/**
 * Copies a finished selection to the system clipboard. A bare click finishes an
 * empty selection, so blank text is a no-op rather than a failure.
 */
export async function copySelection(params: {
  text: string
  strategy: CopyStrategy
  clipboard: ClipboardPort
  runCommand: CommandRunner
}): Promise<CopyResult> {
  const { strategy, clipboard, runCommand } = params
  const text = stripPillGlyphs(params.text)
  if (text.trim() === '') return { kind: 'empty' }
  if (strategy.kind === 'none') return { kind: 'unsupported' }

  const ok =
    strategy.kind === 'command'
      ? await runCommand({ cmd: strategy.cmd, text })
      : clipboard.copyToClipboardOSC52(text)

  return ok ? { kind: 'copied', chars: text.length } : { kind: 'failed' }
}

/**
 * Drops the half-block cells that pad a codespan/kbd pill. They are painted
 * cells inside the same text renderable as the content, so the selection buffer
 * hands them back as ordinary characters.
 */
export function stripPillGlyphs(text: string): string {
  return text.replaceAll(PILL_LEFT, '').replaceAll(PILL_RIGHT, '')
}

/** Status-line text for a copy outcome; null when the outcome deserves silence. */
export function copyStatusText(result: CopyResult): string | null {
  switch (result.kind) {
    case 'copied':
      return `Copied ${result.chars} ${result.chars === 1 ? 'char' : 'chars'}`
    case 'unsupported':
      return 'Copy failed: no clipboard available'
    case 'failed':
      return 'Copy failed'
    case 'empty':
      return null
  }
}

function isRemoteSession(env: Env): boolean {
  return Boolean(env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT)
}

function clipboardCommand(params: {
  env: Env
  platform: string
  hasCommand: (bin: string) => boolean
}): string[] | null {
  const { env, platform, hasCommand } = params

  if (platform === 'darwin') return hasCommand('pbcopy') ? ['pbcopy'] : null
  if (platform === 'win32') return hasCommand('clip.exe') ? ['clip.exe'] : null

  // X11/Wayland tools hang or error without a display server to talk to.
  const hasDisplay = Boolean(env.WAYLAND_DISPLAY || env.DISPLAY)
  if (!hasDisplay) return null
  if (env.WAYLAND_DISPLAY && hasCommand('wl-copy')) return ['wl-copy']
  if (hasCommand('xclip')) return ['xclip', '-selection', 'clipboard']
  if (hasCommand('xsel')) return ['xsel', '--clipboard', '--input']
  return null
}
