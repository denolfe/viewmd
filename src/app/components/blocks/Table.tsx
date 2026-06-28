import { Fragment } from 'react'
import { InlineRenderer } from './InlineRenderer'
import { inlineVisibleWidth, wrapInline } from '../../lib/inline-width'
import { useAppState } from '../../state'
import { theme } from '../../styles/theme'
import { CONTENT_MAX_WIDTH } from '../../styles/layout'
import type { InlineNode, Node } from '../../lib/ast'

const CELL_PADDING_X = 1
const TABLE_MARGIN_X = 2
const MIN_COL_WIDTH = 3

export function Table({ node }: { node: Extract<Node, { kind: 'table' }> }) {
  const { contentWidth } = useAppState()
  const available = (contentWidth || CONTENT_MAX_WIDTH) - TABLE_MARGIN_X * 2
  const desired = computeColumnWidths(node.header, node.rows)
  const colWidths = fitColumnWidths(desired, available)
  const cellWidths = colWidths.map(w => w + CELL_PADDING_X * 2)
  const topRule = '┌' + cellWidths.map(w => '─'.repeat(w)).join('┬') + '┐'
  const midRule = '├' + cellWidths.map(w => '─'.repeat(w)).join('┼') + '┤'
  const botRule = '└' + cellWidths.map(w => '─'.repeat(w)).join('┴') + '┘'

  return (
    <box flexDirection="column" alignSelf="flex-start" marginBottom={1} marginX={TABLE_MARGIN_X}>
      <text fg={theme.border} height={1}>
        {topRule}
      </text>
      <Row cells={node.header} cellWidths={cellWidths} colWidths={colWidths} isHeader />
      <text fg={theme.border} height={1}>
        {midRule}
      </text>
      {node.rows.map((row, ri) => (
        <Row key={ri} cells={row} cellWidths={cellWidths} colWidths={colWidths} />
      ))}
      <text fg={theme.border} height={1}>
        {botRule}
      </text>
    </box>
  )
}

function Row({
  cells,
  cellWidths,
  colWidths,
  isHeader,
}: {
  cells: InlineNode[][]
  cellWidths: number[]
  colWidths: number[]
  isHeader?: boolean
}) {
  const cellLines = cells.map((cell, i) => wrapInline(cell, colWidths[i] ?? 0))
  const lineCount = Math.max(1, ...cellLines.map(c => c.length))
  return (
    <box flexDirection="row">
      <Pipe height={lineCount} />
      {cellLines.map((lines, i) => (
        <Fragment key={i}>
          <box width={cellWidths[i]} paddingX={CELL_PADDING_X}>
            {isHeader ? (
              <text fg={theme.foregroundBright}>
                <strong>
                  <CellLines lines={lines} totalLines={lineCount} />
                </strong>
              </text>
            ) : (
              <text>
                <CellLines lines={lines} totalLines={lineCount} />
              </text>
            )}
          </box>
          <Pipe height={lineCount} />
        </Fragment>
      ))}
    </box>
  )
}

function CellLines({ lines, totalLines }: { lines: InlineNode[][]; totalLines: number }) {
  return (
    <>
      {Array.from({ length: totalLines }).map((_, li) => (
        <Fragment key={li}>
          {li > 0 ? <br /> : null}
          <InlineRenderer nodes={lines[li] ?? []} />
        </Fragment>
      ))}
    </>
  )
}

function Pipe({ height }: { height: number }) {
  const value = Array.from({ length: height }, () => '│').join('\n')
  return (
    <box width={1} height={height}>
      <text fg={theme.border}>{value}</text>
    </box>
  )
}

function fitColumnWidths(desired: number[], available: number): number[] {
  const numCols = desired.length
  if (numCols === 0) return desired
  const chrome = numCols + 1 + numCols * (CELL_PADDING_X * 2) // pipes + per-cell padding
  const budget = Math.max(numCols * MIN_COL_WIDTH, available - chrome)
  let total = desired.reduce((a, b) => a + b, 0)
  if (total <= budget) return desired
  const widths = desired.slice()
  while (total > budget) {
    let idx = 0
    let maxW = widths[0] ?? 0
    for (let i = 1; i < widths.length; i++) {
      const w = widths[i] ?? 0
      if (w > maxW) {
        idx = i
        maxW = w
      }
    }
    if (maxW <= MIN_COL_WIDTH) break
    widths[idx] = maxW - 1
    total--
  }
  return widths
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
