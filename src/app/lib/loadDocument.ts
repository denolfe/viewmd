import { basename, dirname, resolve } from 'node:path'
import { buildTreeFromTokens, lexMarkdown } from './ast'
import type { Node, TocEntry } from './ast'
import { FRONTMATTER_ID, parseFrontmatter, splitFrontmatter } from './frontmatter'
import type { FrontmatterRow } from './frontmatter'
import { computeHeadingLines, countNewlines } from './headingLines'
import { renderDiagramBlocks } from './preprocess'

export type LoadedDocument = {
  nodes: Node[]
  toc: TocEntry[]
  headingIds: string[]
  headingLines: Record<string, number>
  frontmatter: FrontmatterRow[]
  fileLabel?: string
  /** Absolute path of the source file; undefined for stdin. */
  absPath?: string
  /** dirname(absPath); base dir for resolving relative links. Undefined for stdin. */
  dir?: string
}

/** Parses raw markdown into the shape `App` renders from. */
export function buildDocument(md: string, filePath?: string): LoadedDocument {
  const { frontmatter, body } = splitFrontmatter(md)
  const offset = countNewlines(md.slice(0, md.length - body.length))
  // One lex feeds every pass: heading line numbers read `raw`, diagram
  // rendering rewrites `text`/`lang`, and the tree is built from the result.
  const tokens = lexMarkdown(body)
  const headingLines = computeHeadingLines({ tokens, offset })
  const { nodes, toc, headingIds } = buildTreeFromTokens(renderDiagramBlocks(tokens))
  const rows: FrontmatterRow[] = frontmatter ? parseFrontmatter(frontmatter) : []
  const absPath = filePath ? resolve(filePath) : undefined
  return {
    nodes,
    toc,
    // Frontmatter renders above the first heading; expose it as the topmost
    // n/N stop by prepending its synthetic id (only when it actually renders).
    headingIds: rows.length > 0 ? [FRONTMATTER_ID, ...headingIds] : headingIds,
    headingLines,
    frontmatter: rows,
    fileLabel: fileLabel(filePath),
    absPath,
    dir: absPath ? dirname(absPath) : undefined,
  }
}

/** Reads `filePath` and parses it via `buildDocument`. */
export async function loadDocument(filePath: string): Promise<LoadedDocument> {
  const md = await Bun.file(filePath).text()
  return buildDocument(md, filePath)
}

export function fileLabel(p?: string): string | undefined {
  if (!p) return undefined
  const abs = resolve(p)
  const parent = basename(dirname(abs))
  return parent ? `${parent}/${basename(abs)}` : basename(abs)
}
