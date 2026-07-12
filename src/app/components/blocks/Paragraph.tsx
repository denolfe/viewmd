import { InlineRenderer, MatchScope } from './InlineRenderer'
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
        <MatchScope id={id}>
          <InlineRenderer nodes={node.inline} />
        </MatchScope>
      </text>
    </box>
  )
}
