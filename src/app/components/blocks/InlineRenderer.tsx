import type { ReactNode } from 'react'
import { TextAttributes } from '@opentui/core'
import type { InlineNode } from '../../lib/ast'
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
          <span fg={theme.foregroundMuted}>[Image: {node.alt || node.src}</span>
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

// Document-order counter assigned to each rendered match. Relies on React
// rendering function-component bodies top-down in tree order so the nth match
// rendered here lines up with `search.matches[n]` from `findMatches` (which
// walks the AST in the same order). Viewer calls `resetMatchCounter()` before
// the tree renders.
let matchCounter = 0
export function resetMatchCounter(): void {
  matchCounter = 0
}

function HighlightedText({ value }: { value: string }) {
  const { search } = useAppState()
  if (!search?.pattern || !search.matches.length) return <>{value}</>
  const pattern = search.pattern
  const re = new RegExp(escapeRegex(pattern), 'gi')
  const parts: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let keyIdx = 0
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) parts.push(value.slice(last, m.index))
    const isActive = matchCounter++ === search.index
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
