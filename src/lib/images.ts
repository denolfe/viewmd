import fs from 'node:fs'
import path from 'node:path'

import supportsTerminalGraphics from 'supports-terminal-graphics'
import terminalImage from 'terminal-image'

import { colors } from './colors'
import { HEADING_MARKER } from './renderers'

// Linked image: [![alt](img)](url) - must match before plain image
const LINKED_IMAGE_REGEX = /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g
const REF_IMAGE_REGEX = /!\[([^\]]*)\]\[([^\]]+)\]/g
const REF_DEFINITION_REGEX = /^\[([^\]]+)\]:\s*(.+)$/gm
// HTML img tag: <img src="..." alt="..." />
const HTML_IMG_REGEX = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi
const IMAGE_WIDTH = '50%'
const CHUNK_SIZE = 4096
const IMAGE_PLACEHOLDER = '\x00IMG:'
const IMAGE_INDENT = '  '

type ImageMatch = {
  full: string
  alt: string
  src: string
  index: number
  link?: string // For linked images [![alt](img)](link)
  width?: number // Explicit width in pixels (from HTML img tag)
}

type ImageData = {
  buffer: Buffer
  alt: string
  width?: number // Explicit width in pixels
}

type PreparedImages = {
  markdown: string
  images: Map<string, ImageData>
}

/** Check if terminal supports Kitty graphics protocol. */
export function supportsKittyProtocol(): boolean {
  return process.stdout.isTTY === true && supportsTerminalGraphics.stdout.kitty
}

/**
 * Prepare images: replace markdown image syntax with placeholders.
 * Returns modified markdown and map of placeholder -> image data.
 */
export async function prepareImages(markdown: string, basePath?: string): Promise<PreparedImages> {
  // Resolve reference-style images to inline syntax first
  const resolved = resolveReferenceImages(markdown)
  const matches = parseImageMatches(resolved)
  const images = new Map<string, ImageData>()

  if (matches.length === 0) {
    return { markdown: resolved, images }
  }

  let result = resolved
  // Process in reverse to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!
    const imageData = await loadImage(match, basePath)

    if (imageData) {
      const id = `${IMAGE_PLACEHOLDER}${i}\x00`
      images.set(id, imageData)
      result = result.slice(0, match.index) + id + result.slice(match.index + match.full.length)
    } else {
      // Failed to load - use fallback text
      const fallback = formatFallback(match.alt, match.src, match.link)
      result =
        result.slice(0, match.index) + fallback + result.slice(match.index + match.full.length)
    }
  }

  return { markdown: result, images }
}

/**
 * Output rendered content, replacing placeholders with actual images.
 * For Kitty protocol, writes images directly to stdout.
 * For ANSI fallback, returns string with rendered images inline.
 */
export async function outputWithImages(
  rendered: string,
  images: Map<string, ImageData>,
): Promise<void> {
  const isKittySupported = supportsKittyProtocol()

  // Strip heading markers (used by pager for navigation)
  const content = rendered.replaceAll(HEADING_MARKER, '')

  // Find all placeholders and split content
  const placeholderRegex = /\x00IMG:\d+\x00/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = placeholderRegex.exec(content)) !== null) {
    // Output text before placeholder
    const textBefore = content.slice(lastIndex, match.index)
    if (textBefore) process.stdout.write(textBefore)

    // Output image
    const placeholder = match[0]
    const imageData = images.get(placeholder)
    if (imageData) {
      await outputImage(imageData, isKittySupported)
    }

    lastIndex = match.index + placeholder.length
  }

  // Output remaining text
  const remaining = content.slice(lastIndex)
  if (remaining) process.stdout.write(remaining)
}

async function outputImage(imageData: ImageData, isKittySupported: boolean): Promise<void> {
  const { buffer, alt, width } = imageData
  const imageColumns = width ? pixelsToColumns(width) : calculateImageColumns()

  process.stdout.write('\n')

  if (isKittySupported) {
    process.stdout.write(IMAGE_INDENT)
    writeKittyImage(buffer, imageColumns)
  } else {
    const rendered = await terminalImage.buffer(buffer, {
      width: imageColumns,
      preferNativeRender: false,
    })
    // Indent each line of ANSI block output
    const indented = rendered
      .split('\n')
      .map(line => (line ? IMAGE_INDENT + line : line))
      .join('\n')
    process.stdout.write(indented)
  }

  process.stdout.write(formatCaption(alt, imageColumns))
}

function calculateImageColumns(): number {
  const termWidth = process.stdout.columns || 80
  const percentage = Number.parseFloat(IMAGE_WIDTH) / 100
  return Math.floor((termWidth - 2) * percentage)
}

/** Convert pixel width to terminal columns (~8px per character). */
function pixelsToColumns(pixels: number): number {
  return Math.round(pixels / 8)
}

function formatCaption(alt: string, imageWidth: number): string {
  if (!alt) return '\n'

  // Center the caption within image width
  const padding = Math.max(0, Math.floor((imageWidth - alt.length) / 2))
  const centered = ' '.repeat(padding) + alt
  return `\n${IMAGE_INDENT}${colors.caption(centered)}\n`
}

/** Write image using Kitty graphics protocol directly to stdout. */
function writeKittyImage(buffer: Buffer, columns: number): void {
  const base64 = buffer.toString('base64')

  // Send in chunks
  for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
    const chunk = base64.slice(i, i + CHUNK_SIZE)
    const isFirst = i === 0
    const isLast = i + CHUNK_SIZE >= base64.length

    if (isFirst) {
      // f=100: PNG, a=T: transmit+display, c: columns
      process.stdout.write(`\x1b_Gf=100,a=T,c=${columns},m=${isLast ? 0 : 1};${chunk}\x1b\\`)
    } else {
      process.stdout.write(`\x1b_Gm=${isLast ? 0 : 1};${chunk}\x1b\\`)
    }
  }
}

function parseImageMatches(markdown: string): ImageMatch[] {
  const matches: ImageMatch[] = []
  const matchedRanges: Array<[number, number]> = []
  let match: RegExpExecArray | null

  // Reset regex state (global regexes maintain lastIndex across calls)
  LINKED_IMAGE_REGEX.lastIndex = 0
  IMAGE_REGEX.lastIndex = 0
  HTML_IMG_REGEX.lastIndex = 0

  // First, find linked images [![alt](img)](url)
  while ((match = LINKED_IMAGE_REGEX.exec(markdown)) !== null) {
    matches.push({
      full: match[0],
      alt: match[1]!,
      src: match[2]!,
      link: match[3]!,
      index: match.index,
    })
    matchedRanges.push([match.index, match.index + match[0].length])
  }

  // Then find plain images, excluding already matched ranges
  while ((match = IMAGE_REGEX.exec(markdown)) !== null) {
    const start = match.index
    const end = start + match[0].length
    const overlaps = matchedRanges.some(([s, e]) => start >= s && end <= e)
    if (!overlaps) {
      matches.push({
        full: match[0],
        alt: match[1]!,
        src: match[2]!,
        index: match.index,
      })
    }
  }

  // Find HTML img tags
  while ((match = HTML_IMG_REGEX.exec(markdown)) !== null) {
    const tag = match[0]
    const src = match[1]!
    // Extract alt attribute if present
    const altMatch = /alt=["']([^"']*)["']/i.exec(tag)
    const alt = altMatch?.[1] ?? ''
    // Extract width attribute if present (pixels only)
    const widthMatch = /width=["']?(\d+)["']?/i.exec(tag)
    const width = widthMatch ? Number.parseInt(widthMatch[1]!, 10) : undefined
    matches.push({
      full: tag,
      alt,
      src,
      index: match.index,
      width,
    })
  }

  // Sort by index for correct replacement order
  return matches.sort((a, b) => a.index - b.index)
}

/** Resolve reference-style images and links to inline syntax */
function resolveReferenceImages(markdown: string): string {
  // Parse reference definitions [ref]: url
  const refs = new Map<string, string>()
  let match: RegExpExecArray | null

  // Reset regex state (global regexes maintain lastIndex across calls)
  REF_DEFINITION_REGEX.lastIndex = 0

  while ((match = REF_DEFINITION_REGEX.exec(markdown)) !== null) {
    refs.set(match[1]!.toLowerCase(), match[2]!.trim())
  }

  if (refs.size === 0) return markdown

  let result = markdown

  // Resolve reference-style linked images: [![alt][imgref]][linkref]
  const refLinkedImageRegex = /\[!\[([^\]]*)\]\[([^\]]+)\]\]\[([^\]]+)\]/g
  result = result.replace(refLinkedImageRegex, (full, alt, imgRef, linkRef) => {
    const imgUrl = refs.get(imgRef.toLowerCase())
    const linkUrl = refs.get(linkRef.toLowerCase())
    if (imgUrl && linkUrl) return `[![${alt}](${imgUrl})](${linkUrl})`
    return full
  })

  // Resolve reference-style images: ![alt][ref]
  result = result.replace(REF_IMAGE_REGEX, (full, alt, ref) => {
    const url = refs.get(ref.toLowerCase())
    return url ? `![${alt}](${url})` : full
  })

  // Strip reference definition lines (they've been resolved)
  REF_DEFINITION_REGEX.lastIndex = 0
  result = result.replace(REF_DEFINITION_REGEX, '')

  return result
}

async function loadImage(match: ImageMatch, basePath?: string): Promise<ImageData | null> {
  const { alt, src, width } = match

  let imagePath = src
  if (basePath && !src.startsWith('/') && !src.startsWith('http')) {
    imagePath = path.resolve(basePath, src)
  }

  // Skip SVG files (can't be rendered by terminal-image)
  if (isSvgPath(imagePath)) return null

  try {
    if (imagePath.startsWith('http')) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const response = await fetch(imagePath, { signal: controller.signal })
      clearTimeout(timeout)

      if (!response.ok) return null

      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('svg')) return null

      const arrayBuffer = await response.arrayBuffer()
      return { buffer: Buffer.from(arrayBuffer), alt, width }
    }

    if (!fs.existsSync(imagePath)) return null
    return { buffer: fs.readFileSync(imagePath), alt, width }
  } catch {
    return null
  }
}

function isSvgPath(path: string): boolean {
  return path.toLowerCase().endsWith('.svg')
}

function formatFallback(alt: string, src: string, link?: string): string {
  const label = colors.imageLabel(`${alt || 'Image'} →`)
  const url = link ?? src
  // Wrap in markdown link syntax for consistent styling
  // Use explicit reset before URL to avoid inherited styles from previous content
  return `\n${IMAGE_INDENT}${label}\n${IMAGE_INDENT}${url}\n`
}

/**
 * Render single image to stdout (for pager use).
 * Returns approximate height in rows.
 */
export async function renderImage(
  imageData: ImageData,
  isKittySupported: boolean,
): Promise<number> {
  const { buffer, alt, width } = imageData
  const imageColumns = width ? pixelsToColumns(width) : calculateImageColumns()

  process.stdout.write('\n')

  if (isKittySupported) {
    process.stdout.write(IMAGE_INDENT)
    writeKittyImage(buffer, imageColumns)
  } else {
    const rendered = await terminalImage.buffer(buffer, {
      width: imageColumns,
      preferNativeRender: false,
    })
    const indented = rendered
      .split('\n')
      .map(line => (line ? IMAGE_INDENT + line : line))
      .join('\n')
    process.stdout.write(indented)
  }

  process.stdout.write(formatCaption(alt, imageColumns))

  // Return approximate height in rows (rough estimate)
  // TODO: Calculate actual height from image dimensions
  return 10
}

export type { ImageData }
