import type { InlineNode, ListItem, Node } from './ast'
import type { HtmlSegment } from './html'
import { parseHtmlSegments } from './html'
import { blockId } from './scroll-marks'

/**
 * Projection of the document into the exact text the renderer prints.
 * Search, highlighting, and match→row mapping all consume this, so they can
 * never disagree with each other or with the screen.
 */
export type Segment = {
  text: string
  /** Rendered text-element ordinal within the run (0-based, tree order). */
  element: number
  /** False for decorations (details '▾ ') that must never satisfy a match. */
  searchable: boolean
}

export type Run = { key: string; segments: Segment[] }

export type BlockProjection = { blockElementId: string; blockPath: number[]; runs: Run[] }

export function projectDocument(nodes: Node[]): BlockProjection[] {
  const out: BlockProjection[] = []
  walkBlocks(nodes, [], out)
  return out
}

/** Per-document projection lookup, cached on the nodes array identity. */
const mapCache = new WeakMap<Node[], Map<string, BlockProjection>>()
export function projectionMap(nodes: Node[]): Map<string, BlockProjection> {
  let m = mapCache.get(nodes)
  if (!m) {
    m = new Map(projectDocument(nodes).map(p => [p.blockElementId, p]))
    mapCache.set(nodes, m)
  }
  return m
}

export function runText(run: Run): string {
  return run.segments.map(s => s.text).join('')
}

/** Number of rendered text elements a run spans. */
export function runElementCount(run: Run): number {
  return run.segments.reduce((max, s) => Math.max(max, s.element + 1), 0)
}

/** Visible text of inline nodes — what InlineRenderer prints, pills included. */
export function inlineText(nodes: InlineNode[]): string {
  return inlineSegments(nodes, 0)
    .map(s => s.text)
    .join('')
}

export function htmlText(segments: HtmlSegment[]): string {
  return htmlSegs(segments, false)
    .map(s => s.text)
    .join('')
}

/** Stable id for a list-item row box (marker + body). */
export function listItemRowId(itemPath: number[]): string {
  return `itm-${itemPath.join('-')}`
}

/**
 * Visible text of a list-item row: marker + first-paragraph inline text
 * (marker-only when the first child isn't a paragraph). Single source of
 * truth for both the projection and List.tsx's RunScope text.
 */
export function listItemRunText(params: {
  item: ListItem
  ordered: boolean
  index: number
}): string {
  return listItemSegments(params)
    .map(s => s.text)
    .join('')
}

/**
 * Maps an offset in projected text to the corresponding offset in rendered
 * text, tolerating whitespace dropped or inserted by rendering (wrapInline's
 * wrap-point spaces become newlines or vanish). Best effort: on divergence
 * beyond whitespace, returns the rendered position reached so far.
 */
export function alignOffset(projected: string, rendered: string, offset: number): number {
  let i = 0
  let j = 0
  while (i < offset && j < rendered.length) {
    if (projected[i] === rendered[j]) {
      i++
      j++
      continue
    }
    const projectedWs = /\s/.test(projected[i] ?? '')
    const renderedWs = /\s/.test(rendered[j] ?? '')
    if (projectedWs && renderedWs) {
      i++
      j++
      continue
    }
    if (projectedWs) {
      i++
      continue
    }
    if (renderedWs) {
      j++
      continue
    }
    break
  }
  return j
}

export function listMarkerText(item: ListItem, ordered: boolean, index: number): string {
  if (item.task) return item.checked ? '[✓] ' : '[ ] '
  return ordered ? `${index + 1}. ` : '- '
}

export function headingPrefixText(level: number): string {
  return level === 1 ? ' ' : `${'#'.repeat(level)} `
}

export function imageLabelText(alt: string, src: string): string {
  return imageSegs(alt, src, 0)
    .map(s => s.text)
    .join('')
}

const PILL_LEFT = '▐'
const PILL_RIGHT = '▌'

function seg(text: string, element: number, searchable = true): Segment {
  return { text, element, searchable }
}

function walkBlocks(nodes: Node[], path: number[], out: BlockProjection[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n) walkChild(n, [...path, i], out)
  }
}

function walkChild(n: Node, p: number[], out: BlockProjection[]): void {
  switch (n.kind) {
    case 'heading': {
      const segs = [seg(headingPrefixText(n.level), 0), ...inlineSegments(n.text, 0)]
      if (n.level === 1) segs.push(seg(' ', 0))
      out.push({ blockElementId: n.id, blockPath: p, runs: [{ key: 'main', segments: segs }] })
      break
    }
    case 'paragraph':
      out.push({
        blockElementId: blockId(p),
        blockPath: p,
        runs: [{ key: 'main', segments: inlineSegments(n.inline, 0) }],
      })
      break
    case 'code':
      out.push({
        blockElementId: blockId(p),
        blockPath: p,
        runs: [{ key: 'main', segments: [seg(n.value, 0)] }],
      })
      break
    case 'list':
      projectListItems(n.ordered, n.items, p, out)
      break
    case 'blockquote':
      walkBlocks(n.children, p, out)
      break
    case 'table': {
      const runs: Run[] = [
        ...n.header.map((cell, ci) => ({ key: `h${ci}`, segments: inlineSegments(cell, 0) })),
        ...n.rows.flatMap((row, ri) =>
          row.map((cell, ci) => ({ key: `r${ri}c${ci}`, segments: inlineSegments(cell, 0) })),
        ),
      ]
      out.push({ blockElementId: blockId(p), blockPath: p, runs })
      break
    }
    case 'html': {
      const segments = htmlSegs(parseHtmlSegments(n.value), false)
      if (segments.length) {
        out.push({ blockElementId: blockId(p), blockPath: p, runs: [{ key: 'main', segments }] })
      }
      break
    }
    case 'image':
      out.push({
        blockElementId: blockId(p),
        blockPath: p,
        runs: [{ key: 'main', segments: imageSegs(n.alt, n.src, 0) }],
      })
      break
    case 'details':
      out.push({
        blockElementId: blockId(p),
        blockPath: p,
        runs: [
          { key: 'summary', segments: [seg('▾ ', 0, false), ...inlineSegments(n.summary, 0)] },
        ],
      })
      walkBlocks(n.children, p, out)
      break
  }
}

function projectListItems(
  ordered: boolean,
  items: ListItem[],
  listPath: number[],
  out: BlockProjection[],
): void {
  for (let j = 0; j < items.length; j++) {
    const item = items[j]
    if (!item) continue
    const itemPath = [...listPath, j]
    const [first, ...rest] = item.children
    const isFirstParagraph = first?.kind === 'paragraph'
    out.push({
      blockElementId: listItemRowId(itemPath),
      blockPath: itemPath,
      runs: [{ key: 'main', segments: listItemSegments({ item, ordered, index: j }) }],
    })
    // Child paths must match render paths (List.tsx ItemBody) even though the
    // first child was consumed by the joined marker run above.
    const restNodes = isFirstParagraph ? rest : item.children
    const restBase = isFirstParagraph ? 1 : 0
    for (let k = 0; k < restNodes.length; k++) {
      const child = restNodes[k]
      if (child) walkChild(child, [...itemPath, restBase + k], out)
    }
  }
}

/** Segments for a list-item row's 'main' run: marker (element 0) + first-paragraph inline (element 1). */
function listItemSegments(params: { item: ListItem; ordered: boolean; index: number }): Segment[] {
  const { item, ordered, index } = params
  const marker = seg(listMarkerText(item, ordered, index), 0)
  const [first] = item.children
  return first?.kind === 'paragraph' ? [marker, ...inlineSegments(first.inline, 1)] : [marker]
}

function inlineSegments(nodes: InlineNode[], element: number): Segment[] {
  const out: Segment[] = []
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        out.push(seg(n.value, element))
        break
      case 'codespan':
      case 'kbd':
        out.push(seg(PILL_LEFT, element), seg(n.value, element), seg(PILL_RIGHT, element))
        break
      case 'strong':
      case 'em':
      case 'del':
      case 'link':
        out.push(...inlineSegments(n.children, element))
        break
      case 'image':
        out.push(...imageSegs(n.alt, n.src, element))
        break
      case 'br':
        out.push(seg('\n', element))
        break
    }
  }
  return out
}

function imageSegs(alt: string, src: string, element: number): Segment[] {
  const out = [seg('[Image: ', element), seg(alt || src, element)]
  if (alt && src) out.push(seg(' → ', element), seg(src, element))
  out.push(seg(']', element))
  return out
}

function htmlSegs(segments: HtmlSegment[], inLink: boolean): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    if (s.kind === 'text') out.push(seg(s.value, 0))
    else if (s.kind === 'image') {
      if (inLink) out.push(seg('[Image: ', 0), seg(s.alt || s.src, 0), seg(']', 0))
      else out.push(...imageSegs(s.alt, s.src, 0))
    } else out.push(...htmlSegs(s.children, true))
  }
  return out
}
