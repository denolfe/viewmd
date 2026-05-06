#!/usr/bin/env bun

import path from 'node:path'

import { marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

import { terminalColors } from './lib/colors'
import { outputWithImages, prepareImages } from './lib/images'
import { splitIntoLines } from './lib/lines'
import { runPager } from './lib/pager'
import {
  addBlockquotePipe,
  addCodeBlockBox,
  addIndent,
  collapseNestedListBlanks,
  fixCheckboxSpacing,
  fixListInlineTokens,
  hideUrlsInLinks,
  INDENT,
  MERMAID_BLOCK_REGEX,
  replaceKbdTags,
  replaceMermaidBlocks,
  stripHeadingMarkers,
  styleH1,
  useCheckmark,
  useDashBullet,
} from './lib/renderers'
import type { TerminalExtension } from './lib/renderers'
import { readInput } from './lib/utils'

export { MERMAID_BLOCK_REGEX, replaceMermaidBlocks, prepareImages, outputWithImages }
export {
  addBlockquotePipe,
  addCodeBlockBox,
  addIndent,
  collapseNestedListBlanks,
  fixCheckboxSpacing,
  fixListInlineTokens,
  replaceKbdTags,
  stripHeadingMarkers,
  styleH1,
  useCheckmark,
  useDashBullet,
}
export type { TerminalExtension }

type ImageData = {
  buffer: Buffer
  alt: string
}

/** Check if we should use the pager. */
function shouldPaginate(
  content: string,
  images: Map<string, ImageData>,
  skipPager: boolean,
): boolean {
  if (skipPager) return false

  // Don't paginate if not a TTY (allows piping)
  if (!process.stdout.isTTY) return false

  // Calculate total visual lines
  const termWidth = process.stdout.columns || 80
  const termHeight = process.stdout.rows || 24
  const lines = splitIntoLines(content, termWidth)

  // TODO: Account for image heights
  return lines.length > termHeight
}

/** Parse CLI arguments. */
function parseArgs(): { filePath?: string; skipPager: boolean } {
  const args = process.argv.slice(2)
  let filePath: string | undefined
  let skipPager = false

  for (const arg of args) {
    if (arg === '--no-pager') {
      skipPager = true
    } else if (!arg.startsWith('-')) {
      filePath = arg
    }
  }

  return { filePath, skipPager }
}

async function main(): Promise<void> {
  const { filePath, skipPager } = parseArgs()
  const basePath = filePath ? path.dirname(path.resolve(filePath)) : undefined

  const markdown = await readInput(filePath)
  const withMermaid = replaceMermaidBlocks(markdown)
  const withKbd = replaceKbdTags(withMermaid)
  const { markdown: withPlaceholders, images } = await prepareImages(withKbd, basePath)

  const ext = markedTerminal({
    tab: INDENT,
    ...terminalColors,
  })
  fixListInlineTokens(ext)
  addIndent(ext)
  styleH1(ext)
  addBlockquotePipe(ext)
  addCodeBlockBox(ext)
  fixCheckboxSpacing(ext)
  useCheckmark(ext)
  useDashBullet(ext)
  collapseNestedListBlanks(ext)
  hideUrlsInLinks(ext)
  marked.use(ext)

  const rendered = '\n\n' + (marked(withPlaceholders) as string)

  if (shouldPaginate(rendered, images, skipPager)) {
    await runPager(rendered, images)
  } else {
    await outputWithImages(stripHeadingMarkers(rendered), images)
  }
}

if (import.meta.main) {
  main().catch(err => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
