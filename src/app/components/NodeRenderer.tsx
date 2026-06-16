import type { Node } from '../ast'
import { Heading } from './Heading'
import { Paragraph } from './Paragraph'
import { CodeBlock } from './CodeBlock'
import { List } from './List'
import { Blockquote } from './Blockquote'
import { Table } from './Table'

export function NodeRenderer({ node }: { node: Node }) {
  switch (node.kind) {
    case 'heading': return <Heading node={node} />
    case 'paragraph': return <Paragraph node={node} />
    case 'code': return <CodeBlock node={node} />
    case 'list': return <List node={node} />
    case 'blockquote': return <Blockquote node={node} />
    case 'table': return <Table node={node} />
    case 'hr': return <box height={1}><text fg="#666666">{'─'.repeat(80)}</text></box>
    case 'html': return <box><text>{node.value}</text></box>
    case 'space': return <box height={1} />
  }
}

export function NodeList({ nodes }: { nodes: Node[] }) {
  return <>{nodes.map((n, i) => <NodeRenderer key={i} node={n} />)}</>
}
