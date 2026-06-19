#!/usr/bin/env bun
import { basename, dirname, resolve } from 'node:path'
import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './app/App'
import { buildTree } from './app/ast'
import { replaceMermaidBlocks, replaceKbdTags } from './app/preprocess'

const { filePath } = parseArgs(process.argv.slice(2))
if (!process.stdout.isTTY) {
  console.error('sanemd: requires a TTY (piping is no longer supported)')
  process.exit(1)
}

const md = await readInput(filePath)
const processed = replaceKbdTags(replaceMermaidBlocks(md))
const { nodes, toc } = buildTree(processed)

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App nodes={nodes} toc={toc} fileLabel={fileLabel(filePath)} />)

function fileLabel(p?: string): string | undefined {
  if (!p) return undefined
  const abs = resolve(p)
  const parent = basename(dirname(abs))
  return parent ? `${parent}/${basename(abs)}` : basename(abs)
}

function parseArgs(args: string[]): { filePath?: string } {
  for (const a of args) if (!a.startsWith('-')) return { filePath: a }
  return {}
}

async function readInput(filePath?: string): Promise<string> {
  if (filePath) {
    const f = Bun.file(filePath)
    if (!(await f.exists())) throw new Error(`File not found: ${filePath}`)
    return f.text()
  }
  throw new Error('Usage: sanemd <file.md>')
}
