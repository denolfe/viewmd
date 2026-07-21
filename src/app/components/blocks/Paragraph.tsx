import { InlineRenderer, RunScope } from './InlineRenderer'
import { useLinkClick } from './useLinkClick'
import { inlineText } from '../../lib/visible-text'
import type { Node } from '../../lib/ast'

export function Paragraph({
  node,
  id,
}: {
  node: Extract<Node, { kind: 'paragraph' }>
  id: string
}) {
  const onMouseDown = useLinkClick(node.inline)
  return (
    <box id={id} paddingX={2} onMouseDown={onMouseDown}>
      <text>
        <RunScope blockId={id} text={inlineText(node.inline)}>
          <InlineRenderer nodes={node.inline} />
        </RunScope>
      </text>
    </box>
  )
}
