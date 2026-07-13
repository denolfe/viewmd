import { HighlightedText, InlineRenderer, RunScope } from './InlineRenderer'
import { NodeList, NodeRenderer } from './NodeRenderer'
import { theme } from '../../styles/theme'
import { blockId } from '../../lib/scroll-marks'
import { inlineText, listItemRowId, listMarkerText } from '../../lib/visible-text'
import type { ListItem, Node } from '../../lib/ast'

export function List({ node, path }: { node: Extract<Node, { kind: 'list' }>; path: number[] }) {
  return (
    <box paddingLeft={2}>
      {node.items.map((item, i) => {
        const itemPath = [...path, i]
        const [first] = item.children
        const marker = listMarkerText(item, node.ordered, i)
        const runText = first?.kind === 'paragraph' ? marker + inlineText(first.inline) : marker
        return (
          <box key={i} id={listItemRowId(itemPath)} flexDirection="row">
            <RunScope blockId={listItemRowId(itemPath)} text={runText}>
              <Marker item={item} text={marker} />
              <box flexGrow={1}>
                <ItemBody nodes={item.children} pathPrefix={itemPath} />
              </box>
            </RunScope>
          </box>
        )
      })}
    </box>
  )
}

function Marker({ item, text }: { item: ListItem; text: string }) {
  if (item.task) {
    return (
      <text>
        <span fg={item.checked ? theme.green : theme.foregroundMuted}>
          <HighlightedText value={text} />
        </span>
      </text>
    )
  }
  return (
    <text>
      <HighlightedText value={text} />
    </text>
  )
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
