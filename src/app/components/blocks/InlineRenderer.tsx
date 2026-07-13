import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { TextAttributes } from '@opentui/core'
import type { InlineNode } from '../../lib/ast'
import type { SearchState } from '../../state'
import { useAppState } from '../../state'
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
      return (
        <a href={node.href}>
          <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
            <InlineRenderer nodes={node.children} />
          </span>
        </a>
      )
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

/**
 * Per-run scope for range-based highlighting. `text` is the run's projected
 * visible text; ranges are match offsets within it. The cursor is recreated
 * every render and advanced by each HighlightedText in render order, aligning
 * leaf values into the run text by ordered indexOf (robust to pill glyphs and
 * to wrapInline's dropped whitespace in tables). Relies on no React StrictMode
 * and no memoized consumers — double-invoke or memoization would desync the cursor.
 */
/** Ranges are consumed in ascending, non-overlapping order (findMatches' regex emission order). */
export type HighlightRange = { start: number; end: number; isActive: boolean }
type RunScopeValue = { text: string; ranges: HighlightRange[]; cursor: { pos: number } }
const RunScopeContext = createContext<RunScopeValue | null>(null)

export function matchRangesForRun(
  search: Pick<SearchState, 'matches' | 'index'> | null,
  blockElementId: string,
  runKey: string,
): HighlightRange[] {
  if (!search?.matches.length) return []
  const active = search.index >= 0 ? search.matches[search.index] : undefined
  const out: HighlightRange[] = []
  for (const m of search.matches) {
    if (m.blockElementId !== blockElementId || m.runKey !== runKey) continue
    out.push({ start: m.start, end: m.start + m.length, isActive: m === active })
  }
  return out
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

/** Transitional no-op scope for renderers not yet migrated (removed in Tasks 4–6). */
export function MatchScope({ children }: { id: string; children: ReactNode }) {
  return <>{children}</>
}

/** Transitional stub for CodeBlock's active-match lookup (removed in Task 5). */
export function activeOccurrenceInBlock(..._args: unknown[]): number {
  return -1
}
