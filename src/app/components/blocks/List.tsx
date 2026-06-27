import { InlineRenderer } from './InlineRenderer'
import { NodeList } from './NodeRenderer'
import { theme } from '../../styles/theme'
import type { ListItem, Node } from '../../lib/ast'

export function List({ node }: { node: Extract<Node, { kind: 'list' }> }) {
  return (
    <box paddingLeft={2}>
      {node.items.map((item, i) => (
        <box key={i} flexDirection="row">
          <Marker item={item} ordered={node.ordered} index={i} />
          <box flexGrow={1}>
            <ItemBody nodes={item.children} />
          </box>
        </box>
      ))}
    </box>
  )
}

function Marker({ item, ordered, index }: { item: ListItem; ordered: boolean; index: number }) {
  if (item.task) {
    return (
      <text>
        <span fg={item.checked ? theme.green : theme.foregroundMuted}>
          {item.checked ? '[✓] ' : '[ ] '}
        </span>
      </text>
    )
  }
  return <text>{ordered ? `${index + 1}. ` : '- '}</text>
}

function ItemBody({ nodes }: { nodes: Node[] }) {
  const [first, ...rest] = nodes
  if (first?.kind === 'paragraph') {
    return (
      <>
        <text>
          <InlineRenderer nodes={first.inline} />
        </text>
        {rest.length > 0 && <NodeList nodes={rest} />}
      </>
    )
  }
  return <NodeList nodes={nodes} />
}
