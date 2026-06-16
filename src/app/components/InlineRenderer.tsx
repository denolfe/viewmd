import type { ReactNode } from 'react'
import type { InlineNode } from '../ast'
import { useAppState } from '../state'
import { theme } from '../theme'

export function InlineRenderer({ nodes }: { nodes: InlineNode[] }) {
  return <>{nodes.map((n, i) => <InlineOne key={i} node={n} />)}</>
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
    case 'codespan':
      return (
        <span bg={theme.codespanBg}>
          <HighlightedText value={node.value} />
        </span>
      )
    case 'link':
      return (
        <a href={node.href}>
          <span fg={theme.link}>
            <InlineRenderer nodes={node.children} />
          </span>
        </a>
      )
    case 'image':
      return <span fg={theme.foregroundMuted}>[Image: {node.alt}]</span>
    case 'br':
      return <br />
    case 'kbd':
      return (
        <span bg={theme.kbdBg}>
          <HighlightedText value={` ${node.value} `} />
        </span>
      )
  }
}

// v1 highlight: re-scans each text leaf for the pattern. All matches share one
// color — distinguishing the "current" match across leaf boundaries would require
// threading Match objects + offsets through the render tree, deferred to v2.
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
    parts.push(
      <span key={`m${keyIdx++}`} bg={theme.searchMatchBg} fg={theme.searchMatchFg}>
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
    if (re.lastIndex === m.index) re.lastIndex++ // safety for zero-length match
  }
  if (last < value.length) parts.push(value.slice(last))
  return <>{parts}</>
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
