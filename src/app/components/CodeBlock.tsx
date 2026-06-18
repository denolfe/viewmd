import { useTerminalDimensions } from '@opentui/react'
import { theme } from '../theme'
import { syntaxStyle } from '../syntax-style'
import type { Node } from '../ast'

const BORDER = 2 // left + right border cells
const PADDING_X = 2
const MARGIN_X = 2

export function CodeBlock({ node }: { node: Extract<Node, { kind: 'code' }> }) {
  const { width: termWidth } = useTerminalDimensions()

  // Mermaid ASCII already carries its own frame; render it bare.
  if (node.lang === 'mermaid') {
    return (
      <box marginY={1} marginX={MARGIN_X}>
        <text>{node.value}</text>
      </box>
    )
  }

  const lang = node.lang && node.lang !== 'text' ? node.lang : undefined
  const title = lang ? ` ${lang} ` : undefined

  const lines = node.value.split('\n')
  const contentWidth = lines.reduce((max, l) => Math.max(max, l.length), title?.length ?? 0)
  const frameWidth = contentWidth + 2 * PADDING_X + BORDER
  const maxFrameWidth = Math.max(1, termWidth - 2 * MARGIN_X)

  return (
    <box
      border
      borderColor={theme.border}
      title={title}
      width={Math.min(frameWidth, maxFrameWidth)}
      marginY={1}
      marginX={MARGIN_X}
      paddingX={PADDING_X}
      paddingY={1}
    >
      {lang ? (
        <code content={node.value} filetype={lang} syntaxStyle={syntaxStyle} />
      ) : (
        <text>{node.value}</text>
      )}
    </box>
  )
}
