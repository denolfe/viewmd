import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { PLATFORM_PACKAGES } from '../bin/viewmd.cjs'

describe('launcher', () => {
  test('maps all 5 platforms to viewmd-<id> packages', () => {
    expect(Object.keys(PLATFORM_PACKAGES).sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-x64',
    ])
    expect(PLATFORM_PACKAGES['win32-x64'].bin).toBe('viewmd.exe')
  })

  test('VIEWMD_BIN_PATH override execs the given binary', () => {
    const bin = `${process.cwd()}/dist/bin/viewmd`
    if (!existsSync(bin)) throw new Error('run `bun run build:bin` first (Task 2)')
    const res = spawnSync('node', ['bin/viewmd.cjs', '--render', 'README.md'], {
      env: { ...process.env, VIEWMD_BIN_PATH: bin },
      encoding: 'utf8',
    })
    expect(res.status).toBe(0)
    expect(res.stdout.length).toBeGreaterThan(0)
  })
})
