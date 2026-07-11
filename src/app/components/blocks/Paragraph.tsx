import { InlineRenderer } from './InlineRenderer'
import type { Node } from '../../lib/ast'

export function Paragraph({
  node,
  id,
}: {
  node: Extract<Node, { kind: 'paragraph' }>
  id: string
}) {
  return (
    <box id={id} paddingX={2}>
      <text>
        <InlineRenderer nodes={node.inline} />
      </text>
    </box>
  )
}
