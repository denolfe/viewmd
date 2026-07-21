import { Fragment } from 'react'
import { FRONTMATTER_ID } from '../../lib/frontmatter'
import type { FrontmatterRow } from '../../lib/frontmatter'
import { useAppState } from '../../state'
import { theme } from '../../styles/theme'
import { CONTENT_MAX_WIDTH } from '../../styles/layout'

const CELL_PAD = 1
const MARGIN_X = 2
const MIN_VAL_WIDTH = 3

export function Frontmatter({ rows }: { rows: FrontmatterRow[] }) {
  const { contentWidth } = useAppState()
  if (rows.length === 0) return null

  const keyInner = rows.reduce((w, r) => Math.max(w, r.key.length), 0)
  const available = (contentWidth || CONTENT_MAX_WIDTH) - MARGIN_X * 2
  const chrome = 3 + CELL_PAD * 4
  const valInner = Math.max(MIN_VAL_WIDTH, available - chrome - keyInner)
  const keyOuter = keyInner + CELL_PAD * 2
  const valOuter = valInner + CELL_PAD * 2
  const topRule = '┌' + '─'.repeat(keyOuter) + '┬' + '─'.repeat(valOuter) + '┐'
  const botRule = '└' + '─'.repeat(keyOuter) + '┴' + '─'.repeat(valOuter) + '┘'

  return (
    <box
      id={FRONTMATTER_ID}
      flexDirection="column"
      alignSelf="flex-start"
      marginBottom={1}
      marginX={MARGIN_X}
    >
      <text fg={theme.border} height={1}>
        {topRule}
      </text>
      {rows.map((row, i) => (
        <Row key={i} row={row} keyInner={keyInner} valInner={valInner} />
      ))}
      <text fg={theme.border} height={1}>
        {botRule}
      </text>
    </box>
  )
}

function Row({
  row,
  keyInner,
  valInner,
}: {
  row: FrontmatterRow
  keyInner: number
  valInner: number
}) {
  const valueLines = rowValueLines(row, valInner)
  const keyLabel = row.kind === 'inline' || row.key !== '' ? row.key : ''
  const height = valueLines.length
  return (
    <box flexDirection="row">
      <Pipe height={height} />
      <box width={keyInner + CELL_PAD * 2} paddingX={CELL_PAD}>
        <text fg={theme.foregroundMuted}>{keyLabel}</text>
      </box>
      <Pipe height={height} />
      <box width={valInner + CELL_PAD * 2} paddingX={CELL_PAD}>
        <text>
          {valueLines.map((line, li) => (
            <Fragment key={li}>
              {li > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </text>
      </box>
      <Pipe height={height} />
    </box>
  )
}

function rowValueLines(row: FrontmatterRow, valInner: number): string[] {
  if (row.kind === 'inline') return wrapPlain(row.value, valInner)
  const normalized = stripCommonIndent(row.lines)
  return normalized.flatMap(line => wrapPlain(line, valInner))
}

function stripCommonIndent(lines: string[]): string[] {
  if (lines.length === 0) return lines
  let min = Infinity
  for (const line of lines) {
    if (line.trim() === '') continue
    const lead = line.length - line.trimStart().length
    if (lead < min) min = lead
  }
  if (!Number.isFinite(min) || min === 0) return lines
  return lines.map(line => line.slice(min))
}

function wrapPlain(value: string, width: number): string[] {
  if (width <= 0) return [value]
  const out: string[] = []
  let remaining = value
  while (remaining.length > width) {
    let cut = remaining.lastIndexOf(' ', width)
    if (cut <= 0) cut = width
    out.push(remaining.slice(0, cut).trimEnd())
    remaining = remaining.slice(cut).trimStart()
  }
  if (remaining.length > 0 || out.length === 0) out.push(remaining)
  return out
}

function Pipe({ height }: { height: number }) {
  const value = Array.from({ length: height }, () => '│').join('\n')
  return (
    <box width={1} height={height}>
      <text fg={theme.border}>{value}</text>
    </box>
  )
}
