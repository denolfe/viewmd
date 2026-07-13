import { InlineRenderer, RunScope } from './InlineRenderer'
import { inlineText } from '../../lib/visible-text'
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
        <RunScope blockId={id} text={inlineText(node.inline)}>
          <InlineRenderer nodes={node.inline} />
        </RunScope>
      </text>
    </box>
  )
}
