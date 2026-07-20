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
})
