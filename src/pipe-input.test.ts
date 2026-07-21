import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// End-to-end regression for piped-stdin keyboard input: `cat doc.md | viewmd`
// must still read keys from the controlling terminal (/dev/tty), not the
// exhausted pipe. Runs the real CLI under an expect-allocated pty.
const hasExpect = Bun.spawnSync(['which', 'expect']).exitCode === 0

describe.skipIf(!hasExpect)('piped stdin', () => {
  test('interactive viewer quits on q when doc is piped in', async () => {
    const script = `
      set timeout 10
      spawn sh -c "cat README.md | ./src/index.tsx"
      # first keypress is consumed by the terminal capability handshake
      sleep 1
      send " "
      sleep 0.3
      send "q"
      expect {
        eof { exit 0 }
        timeout { exit 1 }
      }
    `
    const proc = Bun.spawn(['expect', '-c', script], {
      cwd: import.meta.dir + '/..',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
  }, 15000)

  test('interactive mode surfaces config warnings after exit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'viewmd-cfg-'))
    const cfg = join(dir, 'bad.toml')
    await writeFile(cfg, 'bogus = 1\n')
    const script = `
      set timeout 10
      spawn ./src/index.tsx README.md
      # first keypress is consumed by the terminal capability handshake
      sleep 1
      send " "
      sleep 0.3
      send "q"
      expect {
        eof { exit 0 }
        timeout { exit 1 }
      }
    `
    const proc = Bun.spawn(['expect', '-c', script], {
      cwd: import.meta.dir + '/..',
      env: { ...process.env, VIEWMD_CONFIG: cfg },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    // expect echoes the pty session (both stdout and stderr of the child) to
    // its own stdout, so the post-teardown stderr warning lands here.
    const out = await new Response(proc.stdout).text()
    await proc.exited
    expect(out).toContain(`unknown config key 'bogus'`)
    await rm(dir, { recursive: true, force: true })
  }, 15000)
})

test('render mode applies VIEWMD_CONFIG max-lines and keeps stdout clean of warnings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'viewmd-cfg-'))
  await writeFile(join(dir, 'config.toml'), 'max-lines = 3\nbogus = 1\n')
  const proc = Bun.spawn(['./src/index.tsx', '--render', 'README.md'], {
    env: { ...process.env, VIEWMD_CONFIG: join(dir, 'config.toml') },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  expect(out.split('\n').length).toBeLessThanOrEqual(4) // 3 rows + trailing newline
  expect(err).toContain(`unknown config key 'bogus'`)
  expect(out).not.toContain('unknown config key')
  await rm(dir, { recursive: true, force: true })
})
