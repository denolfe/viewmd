import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  test('VIEWMD_BIN_PATH override execs the given binary, forwarding args and exit code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'viewmd-stub-'))
    const stub = join(dir, 'stub.js')
    writeFileSync(
      stub,
      '#!/usr/bin/env node\nprocess.stdout.write(`STUB:${process.argv.slice(2).join(" ")}`)\n',
    )
    chmodSync(stub, 0o755)
    const res = spawnSync('node', ['bin/viewmd.cjs', '--render', 'README.md'], {
      env: { ...process.env, VIEWMD_BIN_PATH: stub },
      encoding: 'utf8',
    })
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('STUB:--render README.md')
  })
})
