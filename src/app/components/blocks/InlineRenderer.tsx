import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { TextAttributes } from '@opentui/core'
import type { InlineNode } from '../../lib/ast'
import type { Match } from '../../lib/search'
import type { SearchState } from '../../state'
import { useAppState } from '../../state'
import { classifyHref } from '../../lib/links'
import { theme } from '../../styles/theme'

// Half-block pill: ▐/▌ render as a half-filled edge cell, giving the colored span a half-cell of padding each side.
export function Pill({ bg, fg, children }: { bg: string; fg?: string; children: ReactNode }) {
  return (
    <>
      <span fg={bg}>▐</span>
      <span bg={bg} fg={fg}>
        {children}
      </span>
      <span fg={bg}>▌</span>
    </>
  )
}

export function InlineRenderer({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <InlineOne key={i} node={n} />
      ))}
    </>
  )
}

function InlineOne({ node }: { node: InlineNode }) {
  switch (node.kind) {
    case 'text':
      return <HighlightedText value={node.value} />
    case 'strong':
      return (
        <strong>
          <InlineRenderer nodes={node.children} />
        </strong>
      )
    case 'em':
      return (
        <em>
          <InlineRenderer nodes={node.children} />
        </em>
      )
    case 'del':
      return (
        <span attributes={TextAttributes.STRIKETHROUGH}>
          <InlineRenderer nodes={node.children} />
        </span>
      )
    case 'codespan':
      return (
        <Pill bg={theme.codespanBg} fg={theme.codespanFg}>
          <HighlightedText value={node.value} />
        </Pill>
      )
    case 'link':
      return <InlineLink node={node} />
    case 'image':
      return (
        <em>
          <span fg={theme.foregroundMuted}>
            <HighlightedText value="[Image: " />
            <HighlightedText value={node.alt || node.src} />
          </span>
          {node.alt && node.src ? (
            <>
              <span fg={theme.foregroundMuted}>
                <HighlightedText value=" → " />
              </span>
              <a href={node.src}>
                <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
                  <HighlightedText value={node.src} />
                </span>
              </a>
            </>
          ) : null}
          <span fg={theme.foregroundMuted}>
            <HighlightedText value="]" />
          </span>
        </em>
      )
    case 'br':
      return <br />
    case 'kbd':
      return (
        <Pill bg={theme.kbdBg}>
          <HighlightedText value={node.value} />
        </Pill>
      )
  }
}

function InlineLink({ node }: { node: Extract<InlineNode, { kind: 'link' }> }) {
  const { dir } = useAppState()
  const target = classifyHref({ baseDir: dir, href: node.href })
  const children = <InlineRenderer nodes={node.children} />
  // Navigable links (relative .md / in-doc anchor) render WITHOUT an <a>: emitting an
  // OSC-8 hyperlink would make the terminal try to "open" a local path. External links
  // keep the OSC-8 link so cmd-click still opens them in a browser.
  if (target.kind === 'ignore') {
    return (
      <a href={node.href}>
        <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
          {children}
        </span>
      </a>
    )
  }
  return (
    <span fg={theme.navLink} attributes={TextAttributes.UNDERLINE}>
      {children}
    </span>
  )
}

/**
 * Per-run scope for range-based highlighting. `text` is the run's projected
 * visible text; ranges are match offsets within it. The cursor is recreated
 * every render and advanced by each HighlightedText in render order, aligning
 * leaf values into the run text by ordered indexOf (robust to pill glyphs and
 * to wrapInline's dropped whitespace in tables). Relies on no React StrictMode:
 * a double-invoke would advance the cursor twice.
 *
 * A memo boundary is safe only *above* a RunScope, where the scope and all its
 * HighlightedText descendants are skipped or rendered as one unit. Memoizing
 * anything *between* a RunScope and its leaves would let some leaves advance the
 * cursor while others are skipped, and the ranges would land on the wrong text.
 */
/** Ranges are consumed in ascending, non-overlapping order (findMatches' regex emission order). */
export type HighlightRange = { start: number; end: number; isActive: boolean }
type RunScopeValue = { text: string; ranges: HighlightRange[]; cursor: { pos: number } }
const RunScopeContext = createContext<RunScopeValue | null>(null)

/**
 * Match groups keyed by `blockElementId|runKey`, cached against the match array
 * itself. Every RunScope in the document asks for its own ranges on each render,
 * so scanning the whole match list per call costs `runs × matches` — on a long
 * document under a common pattern that is millions of comparisons per keystroke.
 * Keyed on the array rather than the SearchState because stepping the active
 * match keeps the same matches; only `index` moves.
 */
const runGroups = new WeakMap<Match[], Map<string, Match[]>>()

function groupsFor(matches: Match[]): Map<string, Match[]> {
  const cached = runGroups.get(matches)
  if (cached) return cached
  const groups = new Map<string, Match[]>()
  for (const m of matches) {
    const key = `${m.blockElementId}|${m.runKey}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(m)
    else groups.set(key, [m])
  }
  runGroups.set(matches, groups)
  return groups
}

export function matchRangesForRun(
  search: Pick<SearchState, 'matches' | 'index'> | null,
  blockElementId: string,
  runKey: string,
): HighlightRange[] {
  if (!search?.matches.length) return []
  const group = groupsFor(search.matches).get(`${blockElementId}|${runKey}`)
  if (!group) return []
  const active = search.index >= 0 ? search.matches[search.index] : undefined
  return group.map(m => ({ start: m.start, end: m.start + m.length, isActive: m === active }))
}

export function RunScope({
  blockId,
  runKey = 'main',
  text,
  children,
}: {
  blockId: string
  runKey?: string
  text: string
  children: ReactNode
}) {
  const { search } = useAppState()
  const ranges = matchRangesForRun(search, blockId, runKey)
  return (
    <RunScopeContext.Provider value={{ text, ranges, cursor: { pos: 0 } }}>
      {children}
    </RunScopeContext.Provider>
  )
}

export function HighlightedText({ value }: { value: string }) {
  const scope = useContext(RunScopeContext)
  if (!scope || scope.ranges.length === 0 || !value) return <>{value}</>
  const found = scope.text.indexOf(value, scope.cursor.pos)
  const base = found >= 0 ? found : scope.cursor.pos
  scope.cursor.pos = base + value.length
  const parts: ReactNode[] = []
  let last = 0
  let keyIdx = 0
  for (const r of scope.ranges) {
    const s = Math.max(0, r.start - base)
    const e = Math.min(value.length, r.end - base)
    if (e <= s || e <= last) continue
    if (s > last) parts.push(value.slice(last, s))
    parts.push(
      <span
        key={`m${keyIdx++}`}
        bg={r.isActive ? theme.searchCurrentBg : theme.searchMatchBg}
        fg={theme.searchMatchFg}
      >
        {value.slice(Math.max(s, last), e)}
      </span>,
    )
    last = e
  }
  if (last < value.length) parts.push(value.slice(last))
  return <>{parts}</>
}
