import { basename, dirname, resolve } from 'node:path'
import { buildTree } from './ast'
import type { Node, TocEntry } from './ast'
import { parseFrontmatter, splitFrontmatter } from './frontmatter'
import type { FrontmatterRow } from './frontmatter'
import { replaceMermaidBlocks } from './preprocess'

export type LoadedDocument = {
  nodes: Node[]
  toc: TocEntry[]
  headingIds: string[]
  frontmatter: FrontmatterRow[]
  fileLabel?: string
}

/** Parses raw markdown into the shape `App` renders from. */
export function buildDocument(md: string, filePath?: string): LoadedDocument {
  const { frontmatter, body } = splitFrontmatter(md)
  const processed = replaceMermaidBlocks(body)
  const { nodes, toc, headingIds } = buildTree(processed)
  const rows: FrontmatterRow[] = frontmatter ? parseFrontmatter(frontmatter) : []
  return { nodes, toc, headingIds, frontmatter: rows, fileLabel: fileLabel(filePath) }
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
