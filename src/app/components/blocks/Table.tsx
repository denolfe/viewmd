import { Fragment } from 'react'
import { InlineRenderer } from './InlineRenderer'
import { inlineVisibleWidth } from '../../lib/inline-width'
import { theme } from '../../styles/theme'
import type { InlineNode, Node } from '../../lib/ast'

const CELL_PADDING_X = 1

export function Table({ node }: { node: Extract<Node, { kind: 'table' }> }) {
  const colWidths = computeColumnWidths(node.header, node.rows)
  const cellWidths = colWidths.map(w => w + CELL_PADDING_X * 2)
  const topRule = '┌' + cellWidths.map(w => '─'.repeat(w)).join('┬') + '┐'
  const midRule = '├' + cellWidths.map(w => '─'.repeat(w)).join('┼') + '┤'
  const botRule = '└' + cellWidths.map(w => '─'.repeat(w)).join('┴') + '┘'

  return (
    <box flexDirection="column" alignSelf="flex-start" marginY={1} marginX={2}>
      <text fg={theme.border}>{topRule}</text>
      <Row cells={node.header} cellWidths={cellWidths} isHeader />
      <text fg={theme.border}>{midRule}</text>
      {node.rows.map((row, ri) => (
        <Row key={ri} cells={row} cellWidths={cellWidths} />
      ))}
      <text fg={theme.border}>{botRule}</text>
    </box>
  )
}

function Row({
  cells,
  cellWidths,
  isHeader,
}: {
  cells: InlineNode[][]
  cellWidths: number[]
  isHeader?: boolean
}) {
  return (
    <box flexDirection="row">
      <Pipe />
      {cells.map((cell, i) => (
        <Fragment key={i}>
          <box width={cellWidths[i]} paddingX={CELL_PADDING_X}>
            {isHeader ? (
              <text fg={theme.foregroundBright}>
                <strong>
                  <InlineRenderer nodes={cell} />
                </strong>
              </text>
            ) : (
              <text>
                <InlineRenderer nodes={cell} />
              </text>
            )}
          </box>
          <Pipe />
        </Fragment>
      ))}
    </box>
  )
}

function Pipe() {
  return (
    <box width={1}>
      <text fg={theme.border}>│</text>
    </box>
  )
}

function computeColumnWidths(header: InlineNode[][], rows: InlineNode[][][]): number[] {
  return header.map((headerCell, i) => {
    let max = inlineVisibleWidth(headerCell)
    for (const row of rows) {
      const cell = row[i]
      if (!cell) continue
      const w = inlineVisibleWidth(cell)
      if (w > max) max = w
    }
    return max
  })
}
