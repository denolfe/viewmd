import { Fragment } from 'react'
import { InlineRenderer, MatchScope } from './InlineRenderer'
import { NodeRenderer } from './NodeRenderer'
import { theme } from '../../styles/theme'
import { blockId } from '../../lib/scroll-marks'
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

export function Blockquote({
  node,
  path,
}: {
  node: Extract<Node, { kind: 'blockquote' }>
  path: number[]
}) {
  return (
    <box flexDirection="row" paddingX={2}>
      <box
        border={['left']}
        borderColor={theme.blockquotePipe}
        customBorderChars={PIPE_BORDER_CHARS}
        paddingLeft={1}
        flexGrow={1}
      >
        {node.children.map((child, i) => {
          const childPath = [...path, i]
          return (
            <Fragment key={i}>
              {i > 0 && <box height={1} />}
              {child.kind === 'paragraph' ? (
                <text id={blockId(childPath)} fg={theme.blockquote}>
                  <em>
                    <MatchScope id={blockId(childPath)}>
                      <InlineRenderer nodes={child.inline} />
                    </MatchScope>
                  </em>
                </text>
              ) : (
                <NodeRenderer node={child} path={childPath} />
              )}
            </Fragment>
          )
        })}
      </box>
    </box>
  )
}
