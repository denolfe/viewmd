import { InlineRenderer } from './InlineRenderer'
import type { Node } from '../ast'

export function Paragraph({ node }: { node: Extract<Node, { kind: 'paragraph' }> }) {
  return (
    <box marginBottom={1} paddingX={2}>
      <text>
        <InlineRenderer nodes={node.inline} />
      </text>
    </box>
  )
}
