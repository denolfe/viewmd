import { describe, expect, test } from 'bun:test'
import { PLATFORMS, hostPlatform, platformPackageName } from './platforms'

describe('platforms', () => {
  test('has exactly the 5 supported platforms', () => {
    expect(PLATFORMS.map(p => p.id).sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-x64',
    ])
  })

  test('platformPackageName prefixes with viewmd-', () => {
    expect(platformPackageName('linux-x64')).toBe('viewmd-linux-x64')
  })

  test('win32 uses viewmd.exe binary name', () => {
    const win = PLATFORMS.find(p => p.id === 'win32-x64')
    expect(win?.binName).toBe('viewmd.exe')
  })

  test('hostPlatform resolves to a known platform', () => {
    expect(PLATFORMS).toContainEqual(hostPlatform())
  })
})
