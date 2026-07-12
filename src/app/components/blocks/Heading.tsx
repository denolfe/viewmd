import { InlineRenderer, MatchScope } from './InlineRenderer'
import { theme } from '../../styles/theme'
import type { Node } from '../../lib/ast'

export function Heading({ node }: { node: Extract<Node, { kind: 'heading' }> }) {
  if (node.level === 1) {
    return (
      <box id={node.id} marginTop={1} marginBottom={1} paddingX={2}>
        <text bg={theme.h1Bg} fg={theme.h1Fg}>
          <strong>
            {` `}
            <MatchScope id={node.id}>
              <InlineRenderer nodes={node.text} />
            </MatchScope>
            {` `}
          </strong>
        </text>
      </box>
    )
  }
  return (
    <box id={node.id} marginBottom={1} paddingX={2}>
      <text fg={theme.heading}>
        <strong>
          {'#'.repeat(node.level)}{' '}
          <MatchScope id={node.id}>
            <InlineRenderer nodes={node.text} />
          </MatchScope>
        </strong>
      </text>
    </box>
  )
}
