import { alignOffset, runElementCount } from './visible-text'
import { matchJumpDelta } from './match-nav'
import type { BlockProjection } from './visible-text'
import type { Match } from './search'
import type { ResolvedMark } from './scroll-marks'

export const PIN_TOP_OFFSET = 1

export type ChildGeometry = { y: number; height: number }

/** Minimal structural view of the text-bearing renderable inside a block box. */
export type TextBearer = { y: number; plainText: string; lineInfo: { lineStartCols: number[] } }

/** Narrow structural port over the scrollbox — the only geometry these fns depend on. */
export type BoxGeometry = {
  viewportTop: number
  viewportHeight: number
  scrollTop: number
  scrollHeight: number
  findChild(id: string): ChildGeometry | null
  collectTextBearers(id: string): TextBearer[]
}

type MatchJumpParams = { match: Match; topOffset?: number }

export function findHeadingNearTop(
  geom: BoxGeometry,
  ids: string[],
  topOffset: number,
): string | null {
  // `childToTopDelta` pins a jumped/anchored heading PIN_TOP_OFFSET rows below the
  // overlay fold (a small gap so it isn't flush behind the crumbs). Allow the same
  // slack here so a freshly pinned heading resolves as current instead of its
  // predecessor — otherwise a post-nav re-resolve would snap the breadcrumb back.
  const viewportTop = geom.viewportTop + topOffset + PIN_TOP_OFFSET
  let bestId: string | null = null
  let bestY = -Infinity
  for (const id of ids) {
    const child = geom.findChild(id)
    if (!child) continue
    if (child.y <= viewportTop && child.y > bestY) {
      bestY = child.y
      bestId = id
    }
  }
  if (bestId) return bestId
  let firstBelowId: string | null = null
  let firstBelowY = Infinity
  for (const id of ids) {
    const child = geom.findChild(id)
    if (!child) continue
    if (child.y < firstBelowY) {
      firstBelowY = child.y
      firstBelowId = id
    }
  }
  return firstBelowId
}

export function findVisibleHeadingIds(
  geom: BoxGeometry,
  ids: string[],
  topOffset: number,
): Set<string> {
  const top = geom.viewportTop + topOffset
  const bottom = geom.viewportTop + geom.viewportHeight
  const out = new Set<string>()
  for (const id of ids) {
    const child = geom.findChild(id)
    if (!child) continue
    const childTop = child.y
    const childBottom = child.y + child.height
    if (childBottom > top && childTop < bottom) out.add(id)
  }
  return out
}

/** Rows to scroll so the content top sits at `targetTop`. The box clamps on apply. */
export function scrollTopDelta(geom: BoxGeometry, targetTop: number): number {
  return targetTop - geom.scrollTop
}

/** Rows to scroll so `id` sits at the viewport top (offset `topOffset` down). Null if unmounted. */
export function childToTopDelta(geom: BoxGeometry, id: string, topOffset: number): number | null {
  const child = geom.findChild(id)
  if (!child) return null
  return child.y - geom.viewportTop - PIN_TOP_OFFSET - topOffset
}

/** Rows to scroll to bring a match into view. Null if its block isn't mounted yet. */
export function matchScrollDelta(
  geom: BoxGeometry,
  projections: Map<string, BlockProjection>,
  params: MatchJumpParams,
): number | null {
  const { match, topOffset } = params
  const y = resolveMatchY(geom, match, projections)
  if (y === null) return null
  return matchJumpDelta({ matchY: y, viewportTop: geom.viewportTop, topOffset: topOffset ?? 0 })
}

/**
 * Screen row of a match's first character: locate the run's target element among
 * the block's text bearers by element ordinal, then align the match's projection
 * offset into the bearer's rendered text.
 */
export function resolveMatchY(
  geom: BoxGeometry,
  match: Match,
  projections: Map<string, BlockProjection>,
): number | null {
  const block = geom.findChild(match.blockElementId)
  if (!block) return null
  const proj = projections.get(match.blockElementId)
  const run = proj?.runs.find(r => r.key === match.runKey)
  if (!proj || !run) return block.y
  const bearers = geom
    .collectTextBearers(match.blockElementId)
    .filter(b => !isRuleBearer(b.plainText))

  // Element ordinal of this run's first element among the block's content bearers.
  // Empty runs still mount an empty <text> bearer, so clamp each run to ≥1.
  let elementBase = 0
  for (const r of proj.runs) {
    if (r === run) break
    elementBase += Math.max(1, runElementCount(r))
  }
  // Find the segment containing match.start, then its offset within that
  // segment's element (segments of one element are contiguous in run order).
  let target: { element: number; offsetInElement: number } | null = null
  let pos = 0
  for (const s of run.segments) {
    if (match.start < pos + s.text.length) {
      let before = 0
      for (const t of run.segments) {
        if (t === s) break
        if (t.element === s.element) before += t.text.length
      }
      target = { element: s.element, offsetInElement: before + (match.start - pos) }
      break
    }
    pos += s.text.length
  }
  if (!target) return block.y
  const found = target
  const targetText = run.segments
    .filter(s => s.element === found.element)
    .map(s => s.text)
    .join('')
  const bearer = bearers[elementBase + found.element]
  if (!bearer) return block.y
  const aligned = alignOffset(targetText, bearer.plainText, found.offsetInElement)
  return bearer.y + visualLineForOffset(bearer.lineInfo.lineStartCols, aligned)
}

export function resolveScrollMarks(
  geom: BoxGeometry,
  tail: number,
  projections: Map<string, BlockProjection>,
  params: { matches: Match[]; activeIndex: number },
): {
  marks: ResolvedMark[]
  scrollTop: number
  scrollHeight: number
  viewportHeight: number
  realContentHeight: number
} {
  const { matches, activeIndex } = params
  const marks: ResolvedMark[] = []
  // Renderable `.y` is screen-absolute and includes the scroll translation
  // (content.translateY = -scrollTop). Convert to document space so marks stay
  // fixed on the track while scrolling: docY = screenY - viewportScreenY + scrollTop.
  const screenToDoc = geom.scrollTop - geom.viewportTop
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    if (!match) continue
    const y = resolveMatchY(geom, match, projections)
    if (y === null) continue
    marks.push({ y: y + screenToDoc, kind: i === activeIndex ? 'activeMatch' : 'match' })
  }
  return {
    marks,
    scrollTop: geom.scrollTop,
    scrollHeight: geom.scrollHeight,
    viewportHeight: geom.viewportHeight,
    realContentHeight: geom.scrollHeight - tail,
  }
}

/**
 * Border/pipe-only text renderables (table rules, │ pipes) — not content
 * elements. Requires at least one rule glyph: purely-whitespace bearers are
 * content (an empty table cell in a wrapped row renders '\n') and must keep
 * their element slot.
 */
export function isRuleBearer(plainText: string): boolean {
  return /^[\s│┌┐└┘├┤┬┴┼─]+$/.test(plainText) && /[│┌┐└┘├┤┬┴┼─]/.test(plainText)
}

/** Visual-line index for a character offset, via lineInfo.lineStartCols (cols ≈ chars). */
function visualLineForOffset(lineStartCols: number[], offset: number): number {
  let line = 0
  for (let i = 0; i < lineStartCols.length; i++) {
    if ((lineStartCols[i] ?? 0) <= offset) line = i
    else break
  }
  return line
}
