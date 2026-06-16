import { InlineRenderer } from './InlineRenderer'
import { theme } from '../theme'
import type { Node } from '../ast'

export function Heading({ node }: { node: Extract<Node, { kind: 'heading' }> }) {
  if (node.level === 1) {
    return (
      <box id={node.id} marginY={1}>
        <text bg={theme.h1Bg} fg={theme.h1Fg}>
          <strong>{` `}<InlineRenderer nodes={node.text} />{` `}</strong>
        </text>
      </box>
    )
  }
  return (
    <box id={node.id} marginTop={1}>
      <text fg={theme.heading}>
        <strong>{'#'.repeat(node.level)}{' '}<InlineRenderer nodes={node.text} /></strong>
      </text>
    </box>
  )
}
