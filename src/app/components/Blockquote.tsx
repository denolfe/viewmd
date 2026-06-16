import { NodeList } from './NodeRenderer'
import { theme } from '../theme'
import type { Node } from '../ast'

export function Blockquote({ node }: { node: Extract<Node, { kind: 'blockquote' }> }) {
  return (
    <box flexDirection="row" marginY={1} paddingX={2}>
      <box width={2}>
        <text fg={theme.blockquotePipe}>{'▌'}</text>
      </box>
      <box flexGrow={1}>
        <NodeList nodes={node.children} />
      </box>
    </box>
  )
}
