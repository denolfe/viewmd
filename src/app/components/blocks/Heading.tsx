import { InlineRenderer } from './InlineRenderer'
import { theme } from '../../styles/theme'
import type { Node } from '../../lib/ast'

export function Heading({ node }: { node: Extract<Node, { kind: 'heading' }> }) {
  if (node.level === 1) {
    return (
      <box id={node.id} marginY={1} paddingX={2}>
        <text bg={theme.h1Bg} fg={theme.h1Fg}>
          <strong>
            {` `}
            <InlineRenderer nodes={node.text} />
            {` `}
          </strong>
        </text>
      </box>
    )
  }
  return (
    <box id={node.id} marginTop={1} marginBottom={1} paddingX={2}>
      <text fg={theme.heading}>
        <strong>
          {'#'.repeat(node.level)} <InlineRenderer nodes={node.text} />
        </strong>
      </text>
    </box>
  )
}
