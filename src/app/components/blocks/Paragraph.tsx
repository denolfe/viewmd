import { InlineRenderer } from './InlineRenderer'
import type { Node } from '../../lib/ast'

export function Paragraph({ node }: { node: Extract<Node, { kind: 'paragraph' }> }) {
  return (
    <box paddingX={2}>
      <text>
        <InlineRenderer nodes={node.inline} />
      </text>
    </box>
  )
}
