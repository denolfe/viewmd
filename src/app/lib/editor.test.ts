import { describe, expect, test } from 'bun:test'
import { resolveEditorCommand, buildEditorArgv } from './editor'

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
