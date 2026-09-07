import type { CommandRunner } from './copy-selection'

/** Real `CommandRunner`: spawns the clipboard binary and writes the text to its stdin. */
export const spawnClipboardCommand: CommandRunner = async ({ cmd, text }) => {
  try {
    const proc = Bun.spawn(cmd, {
      stdin: new TextEncoder().encode(text),
      stdout: 'ignore',
      stderr: 'ignore',
    })
    return (await proc.exited) === 0
  } catch {
    return false
  }
}

/** Presence check for a clipboard binary on PATH. */
export const hasCommand = (bin: string): boolean => Bun.which(bin) !== null
