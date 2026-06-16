import { useTerminalDimensions } from '@opentui/react'
import type { Node } from '../ast'
import { theme } from '../theme'
import { Heading } from './Heading'
import { Paragraph } from './Paragraph'
import { CodeBlock } from './CodeBlock'
import { List } from './List'
import { Blockquote } from './Blockquote'
import { Table } from './Table'

export function NodeRenderer({ node }: { node: Node }) {
  switch (node.kind) {
    case 'heading':
      return <Heading node={node} />
    case 'paragraph':
      return <Paragraph node={node} />
    case 'code':
      return <CodeBlock node={node} />
    case 'list':
      return <List node={node} />
    case 'blockquote':
      return <Blockquote node={node} />
    case 'table':
      return <Table node={node} />
    case 'hr':
      return <Hr />
    case 'html':
      return <text>{node.value}</text>
    case 'space':
      return <box height={1} />
  }
}

function Hr() {
  const { width } = useTerminalDimensions()
  return (
    <box height={1} marginY={1}>
      <text fg={theme.border}>{'─'.repeat(Math.max(0, width))}</text>
    </box>
  )
}

export function NodeList({ nodes }: { nodes: Node[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <NodeRenderer key={i} node={n} />
      ))}
    </>
  )
}
