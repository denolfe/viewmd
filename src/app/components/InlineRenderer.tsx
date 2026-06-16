import type { InlineNode } from '../ast'
import { theme } from '../theme'

export function InlineRenderer({ nodes }: { nodes: InlineNode[] }) {
  return <>{nodes.map((n, i) => <InlineOne key={i} node={n} />)}</>
}

function InlineOne({ node }: { node: InlineNode }) {
  switch (node.kind) {
    case 'text': return <>{node.value}</>
    case 'strong': return <strong><InlineRenderer nodes={node.children} /></strong>
    case 'em': return <em><InlineRenderer nodes={node.children} /></em>
    case 'codespan': return <span bg={theme.codespanBg}>{node.value}</span>
    case 'link': return <a href={node.href}><span fg={theme.link}><InlineRenderer nodes={node.children} /></span></a>
    case 'image': return <span fg={theme.foregroundMuted}>[Image: {node.alt}]</span>
    case 'br': return <br />
    case 'kbd': return <span bg={theme.kbdBg}>{` ${node.value} `}</span>
  }
}
