import { Fragment } from 'react'
import { InlineRenderer } from './InlineRenderer'
import { NodeRenderer } from './NodeRenderer'
import { theme } from '../../styles/theme'
import type { Node } from '../../lib/ast'

const PIPE_BORDER_CHARS = {
  topLeft: '▌',
  topRight: ' ',
  bottomLeft: '▌',
  bottomRight: ' ',
  horizontal: ' ',
  vertical: '▌',
  topT: ' ',
  bottomT: ' ',
  leftT: '▌',
  rightT: ' ',
  cross: '▌',
}

export function Blockquote({ node }: { node: Extract<Node, { kind: 'blockquote' }> }) {
  return (
    <box flexDirection="row" marginY={1} paddingX={2}>
      <box
        border={['left']}
        borderColor={theme.blockquotePipe}
        customBorderChars={PIPE_BORDER_CHARS}
        paddingLeft={1}
        flexGrow={1}
      >
        {node.children.map((child, i) => (
          <Fragment key={i}>
            {i > 0 && <box height={1} />}
            {child.kind === 'paragraph' ? (
              <text fg={theme.blockquote}>
                <em>
                  <InlineRenderer nodes={child.inline} />
                </em>
              </text>
            ) : (
              <NodeRenderer node={child} />
            )}
          </Fragment>
        ))}
      </box>
    </box>
  )
}
