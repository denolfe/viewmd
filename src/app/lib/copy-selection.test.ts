import { describe, expect, mock, test } from 'bun:test'
import type { ClipboardPort, CommandRunner, CopyStrategy } from './copy-selection'
import { copySelection, copyStatusText, resolveCopyStrategy } from './copy-selection'

const makeClipboard = (overrides: Partial<ClipboardPort> = {}): ClipboardPort => ({
  isOsc52Supported: () => true,
  copyToClipboardOSC52: () => true,
  ...overrides,
})

const okRunner: CommandRunner = async () => true
const osc52: CopyStrategy = { kind: 'osc52' }

const resolve = (params: {
  env?: Record<string, string | undefined>
  platform?: string
  commands?: string[]
  isOsc52Supported?: boolean
}) =>
  resolveCopyStrategy({
    env: params.env ?? {},
    platform: params.platform ?? 'darwin',
    hasCommand: bin => (params.commands ?? ['pbcopy', 'xclip', 'xsel', 'wl-copy']).includes(bin),
    isOsc52Supported: params.isOsc52Supported ?? true,
  })

describe('resolveCopyStrategy', () => {
  test('prefers the local command over OSC 52 on macOS', () => {
    expect(resolve({ platform: 'darwin' })).toEqual({ kind: 'command', cmd: ['pbcopy'] })
  })

  test('falls back to OSC 52 when the local binary is missing', () => {
    expect(resolve({ platform: 'darwin', commands: [] })).toEqual({ kind: 'osc52' })
  })

  test('uses OSC 52 over SSH even when a local binary exists', () => {
    expect(resolve({ env: { SSH_CONNECTION: '1.2.3.4 1 5.6.7.8 22' } })).toEqual({ kind: 'osc52' })
    expect(resolve({ env: { SSH_TTY: '/dev/pts/0' } })).toEqual({ kind: 'osc52' })
  })

  test('reports none when nothing can take the text', () => {
    expect(resolve({ platform: 'darwin', commands: [], isOsc52Supported: false })).toEqual({
      kind: 'none',
    })
  })

  test('picks wl-copy under Wayland', () => {
    expect(resolve({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } })).toEqual({
      kind: 'command',
      cmd: ['wl-copy'],
    })
  })

  test('picks xclip under X11', () => {
    expect(resolve({ platform: 'linux', env: { DISPLAY: ':0' } })).toEqual({
      kind: 'command',
      cmd: ['xclip', '-selection', 'clipboard'],
    })
  })

  test('falls back to xsel when xclip is absent', () => {
    expect(resolve({ platform: 'linux', env: { DISPLAY: ':0' }, commands: ['xsel'] })).toEqual({
      kind: 'command',
      cmd: ['xsel', '--clipboard', '--input'],
    })
  })

  test('skips X11 tools with no display server', () => {
    expect(resolve({ platform: 'linux', env: {} })).toEqual({ kind: 'osc52' })
  })

  test('uses clip.exe on Windows', () => {
    expect(resolve({ platform: 'win32', commands: ['clip.exe'] })).toEqual({
      kind: 'command',
      cmd: ['clip.exe'],
    })
  })
})

describe('copySelection', () => {
  test('copies non-empty text over OSC 52 and reports its length', async () => {
    const copyToClipboardOSC52 = mock((_text: string) => true)
    const result = await copySelection({
      text: 'hello',
      strategy: osc52,
      clipboard: makeClipboard({ copyToClipboardOSC52 }),
      runCommand: okRunner,
    })

    expect(result).toEqual({ kind: 'copied', chars: 5 })
    expect(copyToClipboardOSC52).toHaveBeenCalledWith('hello')
  })

  test('pipes the text to the resolved command', async () => {
    const runCommand = mock(async (_p: { cmd: string[]; text: string }) => true)
    const result = await copySelection({
      text: 'hello',
      strategy: { kind: 'command', cmd: ['pbcopy'] },
      clipboard: makeClipboard(),
      runCommand,
    })

    expect(result).toEqual({ kind: 'copied', chars: 5 })
    expect(runCommand).toHaveBeenCalledWith({ cmd: ['pbcopy'], text: 'hello' })
  })

  test('is a no-op for an empty selection', async () => {
    const copyToClipboardOSC52 = mock((_text: string) => true)
    const result = await copySelection({
      text: '',
      strategy: osc52,
      clipboard: makeClipboard({ copyToClipboardOSC52 }),
      runCommand: okRunner,
    })

    expect(result).toEqual({ kind: 'empty' })
    expect(copyToClipboardOSC52).not.toHaveBeenCalled()
  })

  test('is a no-op for a whitespace-only selection', async () => {
    const result = await copySelection({
      text: '  \n ',
      strategy: osc52,
      clipboard: makeClipboard(),
      runCommand: okRunner,
    })
    expect(result).toEqual({ kind: 'empty' })
  })

  test('copies text that has surrounding whitespace verbatim', async () => {
    const runCommand = mock(async (_p: { cmd: string[]; text: string }) => true)
    const result = await copySelection({
      text: '  hi  ',
      strategy: { kind: 'command', cmd: ['pbcopy'] },
      clipboard: makeClipboard(),
      runCommand,
    })

    expect(result).toEqual({ kind: 'copied', chars: 6 })
    expect(runCommand).toHaveBeenCalledWith({ cmd: ['pbcopy'], text: '  hi  ' })
  })

  test('strips the pill glyphs that pad inline code', async () => {
    const runCommand = mock(async (_p: { cmd: string[]; text: string }) => true)
    const result = await copySelection({
      text: 'run ▐bun test▌ now',
      strategy: { kind: 'command', cmd: ['pbcopy'] },
      clipboard: makeClipboard(),
      runCommand,
    })

    expect(runCommand).toHaveBeenCalledWith({ cmd: ['pbcopy'], text: 'run bun test now' })
    expect(result).toEqual({ kind: 'copied', chars: 'run bun test now'.length })
  })

  test('strips a pill glyph left dangling by a partial selection', async () => {
    const runCommand = mock(async (_p: { cmd: string[]; text: string }) => true)
    await copySelection({
      text: 'bun test▌ now',
      strategy: { kind: 'command', cmd: ['pbcopy'] },
      clipboard: makeClipboard(),
      runCommand,
    })

    expect(runCommand).toHaveBeenCalledWith({ cmd: ['pbcopy'], text: 'bun test now' })
  })

  test('treats a pill-glyph-only selection as empty', async () => {
    const runCommand = mock(async (_p: { cmd: string[]; text: string }) => true)
    const result = await copySelection({
      text: '▐▌',
      strategy: { kind: 'command', cmd: ['pbcopy'] },
      clipboard: makeClipboard(),
      runCommand,
    })

    expect(result).toEqual({ kind: 'empty' })
    expect(runCommand).not.toHaveBeenCalled()
  })

  test('reports unsupported when no clipboard path exists', async () => {
    const copyToClipboardOSC52 = mock((_text: string) => true)
    const result = await copySelection({
      text: 'hello',
      strategy: { kind: 'none' },
      clipboard: makeClipboard({ copyToClipboardOSC52 }),
      runCommand: okRunner,
    })

    expect(result).toEqual({ kind: 'unsupported' })
    expect(copyToClipboardOSC52).not.toHaveBeenCalled()
  })

  test('reports failure when the command exits non-zero', async () => {
    const result = await copySelection({
      text: 'hello',
      strategy: { kind: 'command', cmd: ['pbcopy'] },
      clipboard: makeClipboard(),
      runCommand: async () => false,
    })

    expect(result).toEqual({ kind: 'failed' })
  })

  test('reports failure when the OSC 52 write is rejected', async () => {
    const result = await copySelection({
      text: 'hello',
      strategy: osc52,
      clipboard: makeClipboard({ copyToClipboardOSC52: () => false }),
      runCommand: okRunner,
    })

    expect(result).toEqual({ kind: 'failed' })
  })
})

describe('copyStatusText', () => {
  test('pluralizes the character count', () => {
    expect(copyStatusText({ kind: 'copied', chars: 1 })).toBe('Copied 1 char')
    expect(copyStatusText({ kind: 'copied', chars: 42 })).toBe('Copied 42 chars')
  })

  test('stays silent for an empty selection', () => {
    expect(copyStatusText({ kind: 'empty' })).toBeNull()
  })

  test('names the cause when nothing can take the text', () => {
    expect(copyStatusText({ kind: 'unsupported' })).toBe('Copy failed: no clipboard available')
  })

  test('reports a rejected write', () => {
    expect(copyStatusText({ kind: 'failed' })).toBe('Copy failed')
  })
})
