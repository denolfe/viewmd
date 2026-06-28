import { infoStringToFiletype } from '@opentui/core'
import { theme } from '../../styles/theme'
import { syntaxStyle } from '../../styles/syntax-style'
import { useAppState } from '../../state'
import type { Node } from '../../lib/ast'

const BORDER = 2 // left + right border cells
const PADDING_X = 2
const MARGIN_X = 2

export function CodeBlock({ node }: { node: Extract<Node, { kind: 'code' }> }) {
  const { contentWidth } = useAppState()

  // Mermaid ASCII already carries its own frame; render it bare.
  if (node.lang === 'mermaid') {
    return (
      <box marginX={MARGIN_X}>
        <text>{node.value}</text>
      </box>
    )
  }

  const rawLang = node.lang && node.lang !== 'text' ? node.lang : undefined
  const filetype = rawLang ? infoStringToFiletype(rawLang) : undefined
  const title = rawLang ? ` ${rawLang} ` : undefined

  const lines = node.value.split('\n')
  const maxLineWidth = lines.reduce((max, l) => Math.max(max, l.length), title?.length ?? 0)
  const frameWidth = maxLineWidth + 2 * PADDING_X + BORDER
  const maxFrameWidth = Math.max(1, contentWidth - 2 * MARGIN_X)

  return (
    <box
      border
      borderColor={theme.border}
      title={title}
      width={Math.min(frameWidth, maxFrameWidth)}
      marginX={MARGIN_X}
      paddingX={PADDING_X}
      paddingY={1}
    >
      {filetype ? (
        <code content={node.value} filetype={filetype} syntaxStyle={syntaxStyle} wrapMode="char" />
      ) : (
        <text wrapMode="char">{node.value}</text>
      )}
    </box>
  )
}
