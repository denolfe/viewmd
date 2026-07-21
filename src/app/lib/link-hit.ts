import type { InlineNode } from './ast'
import { alignOffset, inlineText } from './visible-text'

/** A link's character range within `inlineText(inline)` offset space. */
export type LinkRange = { href: string; start: number; end: number }

/** Absolute-coordinate point, as delivered by a box-level mouse event. */
export type Point = { x: number; y: number }

/**
 * Structural view of a laid-out text renderable, hit-tested by absolute screen
 * coords. `screenX/screenY` are the bearer's top-left cell; `lineStartCols` /
 * `lineWidthCols` describe each visual (wrapped) line in display columns.
 */
export type HitBearer = {
  screenX: number
  screenY: number
  plainText: string
  lineInfo: { lineStartCols: number[]; lineWidthCols: number[] }
}

/** Minimal renderable tree node needed to walk for bearers. */
type TreeNode = { getChildren(): unknown[] }

/**
 * Resolve an absolute click point to the link href under it, or null.
 *
 * Reconcile the click against the block's real laid-out geometry.
 * `inline` is the inline run whose bearer the click is expected to land in
 * (a paragraph's `node.inline`, a list item's body paragraph, a table cell).
 * We locate that bearer among the block box's text renderables by geometry,
 * convert the point to a rendered-text offset, map it back into `inline`
 * offset space, and test it against the link ranges.
 */
export function resolveLinkAtPoint(params: {
  box: TreeNode
  point: Point
  inline: InlineNode[]
}): string | null {
  const { box, point, inline } = params
  const links = linkRanges(inline)
  if (links.length === 0) return null

  const bearer = bearerAtPoint(collectHitBearers(box, []), point)
  if (!bearer) return null

  const projected = projectedOffsetAtPoint(bearer, point)
  if (projected === null) return null

  const target = inlineText(inline)
  const offset = alignOffset(bearer.plainText, target, projected)
  const hit = links.find(l => offset >= l.start && offset < l.end)
  return hit ? hit.href : null
}

/** Link char ranges within `inlineText(inline)` offset space, in reading order. */
export function linkRanges(inline: InlineNode[]): LinkRange[] {
  const out: LinkRange[] = []
  let offset = 0
  for (const node of inline) {
    const width = inlineText([node]).length
    if (node.kind === 'link') out.push({ href: node.href, start: offset, end: offset + width })
    offset += width
  }
  return out
}

/** All text-bearing renderables under `node`, in tree order, with screen coords. */
export function collectHitBearers(node: TreeNode, out: HitBearer[]): HitBearer[] {
  const self = asHitBearer(node)
  if (self) {
    out.push(self)
    return out
  }
  for (const child of node.getChildren()) {
    collectHitBearers(child as TreeNode, out)
  }
  return out
}

function asHitBearer(node: unknown): HitBearer | null {
  if (!node || typeof node !== 'object') return null
  if (!('plainText' in node) || !('lineInfo' in node)) return null
  if (!('screenX' in node) || !('screenY' in node)) return null
  const li = (node as { lineInfo: unknown }).lineInfo
  if (!li || typeof li !== 'object') return null
  const cols = (li as { lineStartCols?: unknown }).lineStartCols
  const widths = (li as { lineWidthCols?: unknown }).lineWidthCols
  if (!Array.isArray(cols) || !Array.isArray(widths)) return null
  const { screenX, screenY, plainText } = node as {
    screenX: unknown
    screenY: unknown
    plainText: unknown
  }
  if (typeof screenX !== 'number' || typeof screenY !== 'number') return null
  if (typeof plainText !== 'string') return null
  return { screenX, screenY, plainText, lineInfo: { lineStartCols: cols, lineWidthCols: widths } }
}

/** First bearer whose laid-out rectangle contains the point (row and column). */
function bearerAtPoint(bearers: HitBearer[], point: Point): HitBearer | null {
  for (const bearer of bearers) {
    const rows = bearer.lineInfo.lineStartCols.length
    if (point.y < bearer.screenY || point.y >= bearer.screenY + rows) continue
    const row = point.y - bearer.screenY
    const col = point.x - bearer.screenX
    const lineWidth = bearer.lineInfo.lineWidthCols[row] ?? 0
    if (col < 0 || col >= lineWidth) continue
    return bearer
  }
  return null
}

/**
 * Point -> rendered-text (plainText) offset. Assumes 1 col == 1 char (ASCII);
 * wide/CJK/emoji glyphs would drift the column math and are not handled.
 */
function projectedOffsetAtPoint(bearer: HitBearer, point: Point): number | null {
  const row = point.y - bearer.screenY
  const col = point.x - bearer.screenX
  const lineStart = bearer.lineInfo.lineStartCols[row]
  if (lineStart === undefined) return null
  return lineStart + col
}
