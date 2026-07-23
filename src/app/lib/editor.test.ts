import { describe, expect, test, mock } from 'bun:test'
import { resolveEditorCommand, buildEditorArgv, openInEditor } from './editor'
import type { CliRenderer } from '@opentui/core'

describe('resolveEditorCommand', () => {
  test('prefers VIEWMD_EDITOR_COMMAND over EDITOR', () => {
    expect(resolveEditorCommand({ VIEWMD_EDITOR_COMMAND: 'nvim', EDITOR: 'vim' })).toBe('nvim')
  })
  test('falls back to EDITOR when VIEWMD_EDITOR_COMMAND unset', () => {
    expect(resolveEditorCommand({ EDITOR: 'vim' })).toBe('vim')
  })
  test('defaults to vi when both unset', () => {
    expect(resolveEditorCommand({})).toBe('vi')
  })
  test('treats whitespace-only as unset', () => {
    expect(resolveEditorCommand({ VIEWMD_EDITOR_COMMAND: '   ', EDITOR: 'vim' })).toBe('vim')
    expect(resolveEditorCommand({ EDITOR: '  ' })).toBe('vi')
  })
  test('trims surrounding whitespace', () => {
    expect(resolveEditorCommand({ EDITOR: '  code --wait  ' })).toBe('code --wait')
  })
})

describe('buildEditorArgv', () => {
  test('bare binary appends file path', () => {
    expect(buildEditorArgv({ command: 'nvim', filePath: '/a/b.md' })).toEqual(['nvim', '/a/b.md'])
  })
  test('command with flags splits and appends', () => {
    expect(buildEditorArgv({ command: 'code --wait', filePath: '/a/b.md' })).toEqual([
      'code',
      '--wait',
      '/a/b.md',
    ])
  })
  test('substitutes {file} placeholder in place', () => {
    expect(buildEditorArgv({ command: 'nvim +42 {file}', filePath: '/a/b.md' })).toEqual([
      'nvim',
      '+42',
      '/a/b.md',
    ])
  })
  test('honors quoted editor path with spaces', () => {
    expect(buildEditorArgv({ command: '"/my apps/edit" --wait', filePath: '/a/b.md' })).toEqual([
      '/my apps/edit',
      '--wait',
      '/a/b.md',
    ])
  })
  test('whitespace-only command collapses to default vi', () => {
    expect(buildEditorArgv({ command: '   ', filePath: '/a/b.md' })).toEqual(['vi', '/a/b.md'])
  })
})

describe('buildEditorArgv with line', () => {
  test('substitutes {line} and {file} placeholders', () => {
    expect(
      buildEditorArgv({ command: 'code -g {file}:{line}', filePath: '/a/b.md', line: 42 }),
    ).toEqual(['code', '-g', '/a/b.md:42'])
  })
  test('vi-style +N for bare vi', () => {
    expect(buildEditorArgv({ command: 'vi', filePath: '/a/b.md', line: 10 })).toEqual([
      'vi',
      '+10',
      '/a/b.md',
    ])
  })
  test('nvim +N with existing args', () => {
    expect(buildEditorArgv({ command: 'nvim -R', filePath: '/a/b.md', line: 5 })).toEqual([
      'nvim',
      '-R',
      '+5',
      '/a/b.md',
    ])
  })
  test('VS Code -g file:line (no placeholder)', () => {
    expect(buildEditorArgv({ command: 'code --wait', filePath: '/a/b.md', line: 7 })).toEqual([
      'code',
      '--wait',
      '-g',
      '/a/b.md:7',
    ])
  })
  test('sublime file:line', () => {
    expect(buildEditorArgv({ command: 'subl', filePath: '/a/b.md', line: 3 })).toEqual([
      'subl',
      '/a/b.md:3',
    ])
  })
  test('helix file:line', () => {
    expect(buildEditorArgv({ command: 'hx', filePath: '/a/b.md', line: 9 })).toEqual([
      'hx',
      '/a/b.md:9',
    ])
  })
  test('JetBrains --line N file', () => {
    expect(buildEditorArgv({ command: 'idea', filePath: '/a/b.md', line: 12 })).toEqual([
      'idea',
      '--line',
      '12',
      '/a/b.md',
    ])
  })
  test('TextMate -l N file', () => {
    expect(buildEditorArgv({ command: 'mate', filePath: '/a/b.md', line: 4 })).toEqual([
      'mate',
      '-l',
      '4',
      '/a/b.md',
    ])
  })
  test('unknown editor defaults to +N', () => {
    expect(buildEditorArgv({ command: 'myeditor', filePath: '/a/b.md', line: 8 })).toEqual([
      'myeditor',
      '+8',
      '/a/b.md',
    ])
  })
  test('editor detected by basename of an absolute path', () => {
    expect(buildEditorArgv({ command: '/usr/bin/code', filePath: '/a/b.md', line: 2 })).toEqual([
      '/usr/bin/code',
      '-g',
      '/a/b.md:2',
    ])
  })
  test('undefined line keeps existing append-file behavior', () => {
    expect(buildEditorArgv({ command: 'vi', filePath: '/a/b.md' })).toEqual(['vi', '/a/b.md'])
  })
  test('{file}-only template gets no line even when line provided', () => {
    expect(
      buildEditorArgv({ command: 'code --wait {file}', filePath: '/a/b.md', line: 5 }),
    ).toEqual(['code', '--wait', '/a/b.md'])
  })
  test('{line}-only template still appends the file path', () => {
    expect(
      buildEditorArgv({ command: 'myeditor --goto {line}', filePath: '/f.md', line: 5 }),
    ).toEqual(['myeditor', '--goto', '5', '/f.md'])
  })
  test('{line}-only template with no line substitutes empty and appends file', () => {
    expect(buildEditorArgv({ command: 'myeditor --goto {line}', filePath: '/f.md' })).toEqual([
      'myeditor',
      '--goto',
      '',
      '/f.md',
    ])
  })
  test('{file} present means no extra append', () => {
    expect(buildEditorArgv({ command: 'ed {file}:{line}', filePath: '/f.md', line: 5 })).toEqual([
      'ed',
      '/f.md:5',
    ])
  })
})

function makeRenderer(): { renderer: CliRenderer; calls: string[] } {
  const calls: string[] = []
  const renderer = {
    suspend: () => calls.push('suspend'),
    resume: () => calls.push('resume'),
  } as unknown as CliRenderer
  return { renderer, calls }
}

describe('openInEditor', () => {
  test('suspends, spawns argv, resumes; returns ok with exit code', () => {
    const { renderer, calls } = makeRenderer()
    const spawnSync = mock((_cmd: string[]) => ({ exitCode: 0 }))
    const result = openInEditor({ renderer, argv: ['vi', '/a/b.md'], spawnSync })
    expect(result).toEqual({ ok: true, code: 0 })
    expect(calls).toEqual(['suspend', 'resume'])
    expect(spawnSync.mock.calls[0]?.[0]).toEqual(['vi', '/a/b.md'])
  })

  test('resumes and returns error when spawn throws', () => {
    const { renderer, calls } = makeRenderer()
    const spawnSync = mock(() => {
      throw new Error('spawn vi ENOENT')
    })
    const result = openInEditor({ renderer, argv: ['vi', '/a/b.md'], spawnSync })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('ENOENT')
    expect(calls).toEqual(['suspend', 'resume'])
  })

  test('unresolvable binary errors without suspending (no flicker) or spawning', () => {
    const { renderer, calls } = makeRenderer()
    const spawnSync = mock((_cmd: string[]) => ({ exitCode: 0 }))
    const result = openInEditor({
      renderer,
      argv: ['nope', '/a/b.md'],
      spawnSync,
      isExecutable: () => false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('command not found')
    expect(calls).toEqual([])
    expect(spawnSync).not.toHaveBeenCalled()
  })
})
