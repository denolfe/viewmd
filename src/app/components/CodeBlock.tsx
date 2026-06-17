import { theme } from '../theme'
import { syntaxStyle } from '../syntax-style'
import type { Node } from '../ast'

export function CodeBlock({ node }: { node: Extract<Node, { kind: 'code' }> }) {
  const lang = node.lang && node.lang !== 'text' ? node.lang : undefined
  const title = lang ? ` ${lang} ` : undefined
  return (
    <box border borderColor={theme.border} title={title} marginY={1} marginX={2} paddingX={2} paddingY={1}>
      {lang ? (
        <code content={node.value} filetype={lang} syntaxStyle={syntaxStyle} />
      ) : (
        <text>{node.value}</text>
      )}
    </box>
  )
}
