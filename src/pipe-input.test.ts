import { describe, expect, test } from 'bun:test'

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
})
