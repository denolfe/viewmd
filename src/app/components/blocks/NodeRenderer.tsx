import { useTerminalDimensions } from '@opentui/react'
import type { Node } from '../../lib/ast'
import { parseHtmlSegments } from '../../lib/html'
import { theme } from '../../styles/theme'
import { blockId } from '../../lib/scroll-marks'
import { Heading } from './Heading'
import { Paragraph } from './Paragraph'
import { CodeBlock } from './CodeBlock'
import { List } from './List'
import { Blockquote } from './Blockquote'
import { Table } from './Table'
import { Details } from './Details'
import { HtmlBlock } from './HtmlBlock'
import { ImageBlock } from './ImageBlock'

export function NodeRenderer({ node, path }: { node: Node; path: number[] }) {
  const id = blockId(path)
  switch (node.kind) {
    case 'heading':
      return <Heading node={node} />
    case 'paragraph':
      return <Paragraph node={node} id={id} />
    case 'code':
      return <CodeBlock node={node} id={id} />
    case 'list':
      return <List node={node} path={path} />
    case 'blockquote':
      return <Blockquote node={node} path={path} />
    case 'table':
      return <Table node={node} id={id} />
    case 'details':
      return <Details node={node} path={path} />
    case 'hr':
      return <Hr />
    case 'image':
      return <ImageBlock alt={node.alt} src={node.src} id={id} />
    case 'html': {
      const segments = parseHtmlSegments(node.value)
      if (segments.length === 0) return null
      return <HtmlBlock segments={segments} id={id} />
    }
    case 'space':
      return <box height={1} />
  }
}

function Hr() {
  const { width } = useTerminalDimensions()
  return (
    <box height={1}>
      <text fg={theme.border}>{'─'.repeat(Math.max(0, width))}</text>
    </box>
  )
}

export function NodeList({ nodes, pathPrefix = [] }: { nodes: Node[]; pathPrefix?: number[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <NodeRenderer key={i} node={n} path={[...pathPrefix, i]} />
      ))}
    </>
  )
}
