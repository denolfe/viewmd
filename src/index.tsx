#!/usr/bin/env bun
import './compiled-runtime'
import { openSync } from 'node:fs'
import { ReadStream as TtyReadStream } from 'node:tty'
import { addDefaultParsers, createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './app/App'
import { parseArgs } from './app/lib/args'
import { extraParsers } from './app/parsers'
import { buildDocument } from './app/lib/loadDocument'
import { loadConfig, resolveSettings } from './app/lib/config'
import { renderAnsi } from './app/lib/renderAnsi'
import { version } from '../package.json'

const MIN_WIDTH = 20
const RENDER_MAX_HEIGHT = 2000

const HELP_TEXT = `
viewmd - interactive terminal markdown viewer

Usage: viewmd [options] [file.md]
       cat file.md | viewmd

Options:
  -r, --render         One-shot ANSI render to stdout (auto when stdout is not a TTY)
      --max-lines <n>  Cap rendered output to n lines

  -v, --version        Print version
  -h, --help           Show this help`

// No top-level await: the compiled binary ships bytecode, which requires CJS.
main()

async function main(): Promise<void> {
  const { filePath, forceRender, maxLines, showHelp, showVersion, error } = parseArgs(
    process.argv.slice(2),
  )
  if (error) {
    console.error(`viewmd: ${error}`)
    process.exit(1)
  }
  if (showHelp) {
    console.log(HELP_TEXT)
    process.exit(0)
  }
  if (showVersion) {
    console.log(version)
    process.exit(0)
  }
  const md = await readInput(filePath)
  const {
    nodes,
    toc,
    headingIds,
    frontmatter: frontmatterRows,
    fileLabel: label,
  } = buildDocument(md, filePath)

  const { config, warnings } = await loadConfig(process.env)
  const settings = resolveSettings({ config, env: process.env, flags: { maxLines } })

  const renderMode = forceRender || !process.stdout.isTTY
  if (renderMode) {
    for (const w of warnings) process.stderr.write(`${w}\n`)
    const width = clampWidth(
      Number(process.env.FZF_PREVIEW_COLUMNS) || process.stdout.columns || 80,
    )
    const capRows = settings.maxLines
    const out = await renderAnsi({
      nodes,
      frontmatter: frontmatterRows,
      width,
      maxHeight: capRows ?? RENDER_MAX_HEIGHT,
      capRows,
      contentMaxWidth: settings.contentMaxWidth,
    })
    try {
      await Bun.write(Bun.stdout, out + '\n')
    } catch (e) {
      // Reader closed the pipe (e.g. `viewmd file.md | head`); exit quietly
      // like other CLIs instead of dumping a stack trace.
      if (!isEpipe(e)) throw e
    }
    process.exit(0)
  }

  // Print config warnings to the main screen before OpenTUI takes over. The
  // renderer hijacks console.* and runs on the alternate screen, and its
  // teardown bypasses process 'exit' handlers, so neither a console call nor an
  // exit hook reaches the user. Writing here lands the warning on the main
  // buffer, which the alternate screen preserves and restores on quit.
  for (const w of warnings) process.stderr.write(`${w}\n`)

  addDefaultParsers(extraParsers)
  const keyboard = keyboardStream()
  const renderer = await createCliRenderer({ exitOnCtrlC: false, stdin: keyboard })
  if (keyboard !== process.stdin) {
    // Close the /dev/tty fd on quit — destroy() only pauses it, which would keep the process alive.
    renderer.on('destroy', () => keyboard.destroy())
  }
  createRoot(renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={frontmatterRows}
      fileLabel={label}
      filePath={filePath}
      contentMaxWidth={settings.contentMaxWidth}
    />,
  )
}

function isEpipe(e: unknown): boolean {
  return e instanceof Error && 'code' in e && e.code === 'EPIPE'
}

function clampWidth(w: number): number {
  return Number.isFinite(w) && w >= MIN_WIDTH ? Math.floor(w) : MIN_WIDTH
}

/**
 * Stream the renderer reads keys from. When the doc is piped in, process.stdin
 * is the exhausted pipe — keys must come from the controlling terminal instead.
 */
function keyboardStream(): NodeJS.ReadStream {
  if (process.stdin.isTTY) return process.stdin
  try {
    return new TtyReadStream(openSync('/dev/tty', 'r'))
  } catch {
    return process.stdin
  }
}

async function readInput(filePath?: string): Promise<string> {
  if (filePath) return Bun.file(filePath).text()
  if (!process.stdin.isTTY) return Bun.stdin.text()
  console.error('Usage: viewmd <file.md>  (or pipe markdown via stdin; see viewmd --help)')
  process.exit(1)
}
