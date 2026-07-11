import { InlineRenderer } from './InlineRenderer'
import { NodeList, NodeRenderer } from './NodeRenderer'
import { theme } from '../../styles/theme'
import { blockId } from '../../lib/scroll-marks'
import type { ListItem, Node } from '../../lib/ast'

export function List({ node, path }: { node: Extract<Node, { kind: 'list' }>; path: number[] }) {
  return (
    <box paddingLeft={2}>
      {node.items.map((item, i) => (
        <box key={i} flexDirection="row">
          <Marker item={item} ordered={node.ordered} index={i} />
          <box flexGrow={1}>
            <ItemBody nodes={item.children} pathPrefix={[...path, i]} />
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

function ItemBody({ nodes, pathPrefix }: { nodes: Node[]; pathPrefix: number[] }) {
  const [first, ...rest] = nodes
  if (first?.kind === 'paragraph') {
    return (
      <>
        <text id={blockId([...pathPrefix, 0])}>
          <InlineRenderer nodes={first.inline} />
        </text>
        {/* rest[i] is nodes[i+1] since the first child was destructured off index 0 */}
        {rest.map((n, i) => (
          <NodeRenderer key={i + 1} node={n} path={[...pathPrefix, i + 1]} />
        ))}
      </>
    )
  }
  return <NodeList nodes={nodes} pathPrefix={pathPrefix} />
}
