import { NodeList } from './NodeRenderer'
import { theme } from '../theme'
import type { Node } from '../ast'

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
        <NodeList nodes={node.children} />
      </box>
    </box>
  )
}
