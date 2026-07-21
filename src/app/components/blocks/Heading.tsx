import { HighlightedText, InlineRenderer, RunScope } from './InlineRenderer'
import { headingPrefixText, inlineText } from '../../lib/visible-text'
import { theme } from '../../styles/theme'
import type { Node } from '../../lib/ast'

// No onMouseDown link handler here: a heading's rendered text carries a prefix
// (`# ` .. `###### `) absent from inlineText(node.text), so resolveLinkAtPoint's
// alignOffset can't reconcile the click to a link range. Links in headings are a
// known gap; paragraph/list/table clicks cover the common cases.
export function Heading({ node }: { node: Extract<Node, { kind: 'heading' }> }) {
  if (node.level === 1) {
    return (
      <box id={node.id} marginTop={1} marginBottom={1} paddingX={2}>
        <text bg={theme.h1Bg} fg={theme.h1Fg}>
          <strong>
            {` `}
            <RunScope blockId={node.id} text={' ' + inlineText(node.text) + ' '}>
              <InlineRenderer nodes={node.text} />
            </RunScope>
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
          <RunScope blockId={node.id} text={headingPrefixText(node.level) + inlineText(node.text)}>
            <HighlightedText value={headingPrefixText(node.level)} />
            <InlineRenderer nodes={node.text} />
          </RunScope>
        </strong>
      </text>
    </box>
  )
}
