#!/usr/bin/env bun
import './compiled-runtime'
import { openSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { ReadStream as TtyReadStream } from 'node:tty'
import { addDefaultParsers, createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './app/App'
import { parseArgs } from './app/lib/args'
import { buildTree } from './app/lib/ast'
import { extraParsers } from './app/parsers'
import { replaceMermaidBlocks } from './app/lib/preprocess'
import { parseFrontmatter, splitFrontmatter } from './app/lib/frontmatter'
import type { FrontmatterRow } from './app/lib/frontmatter'
import { renderAnsi } from './app/lib/renderAnsi'

const MIN_WIDTH = 20
const RENDER_MAX_HEIGHT = 2000

const { filePath, forceRender } = parseArgs(process.argv.slice(2))
const md = await readInput(filePath)
const { frontmatter, body } = splitFrontmatter(md)
const processed = replaceMermaidBlocks(body)
const { nodes, toc, headingIds } = buildTree(processed)
const frontmatterRows: FrontmatterRow[] = frontmatter ? parseFrontmatter(frontmatter) : []

const renderMode = forceRender || !process.stdout.isTTY
if (renderMode) {
  const width = clampWidth(Number(process.env.FZF_PREVIEW_COLUMNS) || process.stdout.columns || 80)
  const out = await renderAnsi({
    nodes,
    frontmatter: frontmatterRows,
    width,
    maxHeight: RENDER_MAX_HEIGHT,
  })
  await Bun.write(Bun.stdout, out + '\n')
  process.exit(0)
}

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
    fileLabel={fileLabel(filePath)}
  />,
)

function clampWidth(w: number): number {
  return Number.isFinite(w) && w >= MIN_WIDTH ? Math.floor(w) : MIN_WIDTH
}

function fileLabel(p?: string): string | undefined {
  if (!p) return undefined
  const abs = resolve(p)
  const parent = basename(dirname(abs))
  return parent ? `${parent}/${basename(abs)}` : basename(abs)
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
  console.error('Usage: viewmd <file.md>  (or pipe markdown via stdin)')
  process.exit(1)
}
