import { InlineRenderer, MatchScope } from './InlineRenderer'
import { NodeList } from './NodeRenderer'
import { theme } from '../../styles/theme'
import { blockId } from '../../lib/scroll-marks'
import type { Node } from '../../lib/ast'

// <details> is rendered always-expanded with a ▾ marker and indented body.
// The TUI has no way to toggle, so closed-vs-open is collapsed to one state.
// Inner blocks render through the regular pipeline so markdown structure
// (lists, code, etc.) is preserved instead of flattened to plain text.
export function Details({
  node,
  path,
}: {
  node: Extract<Node, { kind: 'details' }>
  path: number[]
}) {
  return (
    <box id={blockId(path)} paddingX={2}>
      <text fg={theme.foregroundMuted}>
        {'▾ '}
        <MatchScope id={blockId(path)}>
          <InlineRenderer nodes={node.summary} />
        </MatchScope>
      </text>
      <box paddingLeft={2}>
        <NodeList nodes={node.children} pathPrefix={path} />
      </box>
    </box>
  )
}
