import { theme } from '../theme'
import type { Node } from '../ast'

export function CodeBlock({ node }: { node: Extract<Node, { kind: 'code' }> }) {
  const lang = node.lang && node.lang !== 'text' ? node.lang : undefined
  return (
    <box border borderColor={theme.border} title={lang} marginY={1} marginX={2} paddingX={1}>
      <text>{node.value}</text>
    </box>
  )
}
