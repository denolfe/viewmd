import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { TextAttributes } from '@opentui/core'
import type { InlineNode } from '../../lib/ast'
import type { Match } from '../../lib/search'
import { useAppState } from '../../state'
import { escapeRegex } from '../../lib/regex-util'
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
            [Image: {node.alt ? <HighlightedText value={node.alt} /> : node.src}
          </span>
          {node.alt && node.src ? (
            <>
              <span fg={theme.foregroundMuted}>{' → '}</span>
              <a href={node.src}>
                <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
                  {node.src}
                </span>
              </a>
            </>
          ) : null}
          <span fg={theme.foregroundMuted}>]</span>
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

// Per-block scope for active-match identification. Each block that renders
// highlightable inline content provides its element id plus an occurrence
// counter; the counter object is recreated on every render, keeping ordinals
// aligned with findMatches' within-block order. Syntax-highlighted code blocks
// highlight through their own chunk transform (CodeBlock) instead of a scope.
type MatchScopeValue = { id: string; counter: { n: number } }
const MatchScopeContext = createContext<MatchScopeValue | null>(null)

export function MatchScope({ id, children }: { id: string; children: ReactNode }) {
  return (
    <MatchScopeContext.Provider value={{ id, counter: { n: 0 } }}>
      {children}
    </MatchScopeContext.Provider>
  )
}

/**
 * Occurrence ordinal (within its block) of the active match, or -1 when the
 * active match lives in a different block. Mirrors the k-counting in the
 * Viewer's resolveMatchY.
 */
export function activeOccurrenceInBlock(
  search: { matches: Match[]; index: number },
  blockElementId: string,
): number {
  if (search.index < 0) return -1
  const active = search.matches[search.index]
  if (!active || active.blockElementId !== blockElementId) return -1
  let occ = 0
  for (let i = 0; i < search.index; i++) {
    if (search.matches[i]?.blockElementId === blockElementId) occ++
  }
  return occ
}

export function HighlightedText({ value }: { value: string }) {
  const { search } = useAppState()
  const scope = useContext(MatchScopeContext)
  if (!search?.pattern || !search.matches.length) return <>{value}</>
  const activeOcc = scope ? activeOccurrenceInBlock(search, scope.id) : -1
  const pattern = search.pattern
  const re = new RegExp(escapeRegex(pattern), 'gi')
  const parts: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let keyIdx = 0
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) parts.push(value.slice(last, m.index))
    const isActive = scope !== null && scope.counter.n++ === activeOcc
    parts.push(
      <span
        key={`m${keyIdx++}`}
        bg={isActive ? theme.searchCurrentBg : theme.searchMatchBg}
        fg={theme.searchMatchFg}
      >
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
    if (re.lastIndex === m.index) re.lastIndex++ // safety for zero-length match
  }
  if (last < value.length) parts.push(value.slice(last))
  return <>{parts}</>
}
