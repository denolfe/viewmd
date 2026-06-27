import { InlineRenderer } from './InlineRenderer'
import { NodeList } from './NodeRenderer'
import type { Node } from '../../lib/ast'

export function List({ node }: { node: Extract<Node, { kind: 'list' }> }) {
  return (
    <box paddingLeft={2}>
      {node.items.map((item, i) => (
        <box key={i} flexDirection="row">
          <text>{node.ordered ? `${i + 1}. ` : '- '}</text>
          <box flexGrow={1}>
            <ItemBody nodes={item} />
          </box>
        </box>
      ))}
    </box>
  )
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
