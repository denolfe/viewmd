import { theme } from '../../styles/theme'
import { Pill } from './InlineRenderer'
import type { InlineNode } from '../../lib/ast'

/** Renders inline nodes as plain muted text (links flattened to their text, code as pills). Shared by the TOC and the breadcrumb. */
export function MutedInline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'text':
            return <span key={i}>{n.value}</span>
          case 'strong':
            return (
              <strong key={i}>
                <MutedInline nodes={n.children} />
              </strong>
            )
          case 'em':
            return (
              <em key={i}>
                <MutedInline nodes={n.children} />
              </em>
            )
          case 'codespan':
            return (
              <Pill key={i} bg={theme.codespanBg} fg={theme.codespanFg}>
                {n.value}
              </Pill>
            )
          case 'kbd':
            return (
              <Pill key={i} bg={theme.kbdBg}>
                {n.value}
              </Pill>
            )
          case 'link':
            return <MutedInline key={i} nodes={n.children} />
          case 'image':
            return <span key={i}>{n.alt || n.src}</span>
          case 'br':
            return <span key={i}> </span>
        }
      })}
    </>
  )
}
