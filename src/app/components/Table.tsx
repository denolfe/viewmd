import { InlineRenderer } from './InlineRenderer'
import { theme } from '../theme'
import type { Node } from '../ast'

export function Table({ node }: { node: Extract<Node, { kind: 'table' }> }) {
  return (
    <box
      flexDirection="column"
      width="100%"
      marginY={1}
      marginX={2}
      border
      borderColor={theme.border}
    >
      <box flexDirection="row">
        {node.header.map((cell, i) => (
          <box key={i} flexGrow={1} flexBasis={0} paddingX={1}>
            <text fg={theme.foregroundBright}>
              <strong>
                <InlineRenderer nodes={cell} />
              </strong>
            </text>
          </box>
        ))}
      </box>
      {node.rows.map((row, ri) => (
        <box key={ri} flexDirection="row">
          {row.map((cell, ci) => (
            <box key={ci} flexGrow={1} flexBasis={0} paddingX={1}>
              <text>
                <InlineRenderer nodes={cell} />
              </text>
            </box>
          ))}
        </box>
      ))}
    </box>
  )
}
