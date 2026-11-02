import { theme } from '../styles/theme'

/** A stretch of diagram text in one color; a diagram's runs concatenate back to its text. */
export type DiagramRun = { text: string; fg: string }

type Box = { top: number; left: number; bottom: number; right: number }

const TOP_LEFT = /[┌╭]/
const TOP_RIGHT = /[┐╮]/
const BOTTOM_LEFT = /[└╰]/
const BOTTOM_RIGHT = /[┘╯]/
// Edges join box borders, so a border admits tees, crosses, and arrowheads.
const TOP_BORDER = /[─┬┴┼▲▼]/
const LEFT_BORDER = /[│├┤┼►◄▶◀]/
const ARROW = /[►◄▲▼▶◀]/
const BOX_DRAWING = /[─-╿]/

/**
 * Colors rendered diagram text. Each innermost box (border and label) takes the next node hue,
 * keyed by label so a repeated node keeps its hue. Every other glyph is colored by role, so
 * enclosing boxes such as subgraph frames paint as lines.
 */
export function paintDiagram(text: string): DiagramRun[] {
  const grid = text.split('\n').map(line => Array.from(line))
  const boxColors = paintBoxes(grid)
  return grid.reduce<DiagramRun[]>((runs, row, r) => {
    if (r > 0) appendCell(runs, '\n', undefined)
    row.forEach((ch, c) => appendCell(runs, ch, boxColors[r]?.[c] ?? roleColor(ch)))
    return runs
  }, [])
}

/** Uncolored cells (whitespace, newlines) join the current run so runs stay few. */
function appendCell(runs: DiagramRun[], ch: string, fg: string | undefined): DiagramRun[] {
  const last = runs.at(-1)
  if (last && (fg === undefined || fg === last.fg)) last.text += ch
  else runs.push({ text: ch, fg: fg ?? theme.diagramText })
  return runs
}

function roleColor(ch: string): string | undefined {
  if (!ch.trim()) return undefined
  if (ARROW.test(ch)) return theme.diagramArrow
  if (BOX_DRAWING.test(ch)) return theme.diagramLine
  return theme.diagramText
}

function paintBoxes(grid: string[][]): (string | undefined)[][] {
  const colors = grid.map(row => row.map((): string | undefined => undefined))
  const boxes = findBoxes(grid)
  const hues = new Map<string, string>()
  for (const box of boxes.filter(outer => !boxes.some(inner => encloses(outer, inner)))) {
    const label = boxLabel(grid, box)
    const hue = hues.get(label) ?? nodeHue(hues.size)
    hues.set(label, hue)
    for (let r = box.top; r <= box.bottom; r++) {
      const row = colors[r]
      if (!row) continue
      for (let c = box.left; c <= box.right; c++) if (grid[r]?.[c]?.trim()) row[c] = hue
    }
  }
  return colors
}

function findBoxes(grid: string[][]): Box[] {
  const at = (r: number, c: number) => grid[r]?.[c] ?? ''
  const boxes: Box[] = []
  grid.forEach((row, top) =>
    row.forEach((ch, left) => {
      if (!TOP_LEFT.test(ch)) return
      let right = left + 1
      while (TOP_BORDER.test(at(top, right))) right++
      if (right === left + 1 || !TOP_RIGHT.test(at(top, right))) return
      let bottom = top + 1
      while (LEFT_BORDER.test(at(bottom, left))) bottom++
      if (!BOTTOM_LEFT.test(at(bottom, left)) || !BOTTOM_RIGHT.test(at(bottom, right))) return
      boxes.push({ top, left, bottom, right })
    }),
  )
  return boxes
}

function encloses(outer: Box, inner: Box): boolean {
  return (
    inner !== outer &&
    inner.top > outer.top &&
    inner.bottom < outer.bottom &&
    inner.left > outer.left &&
    inner.right < outer.right
  )
}

function boxLabel(grid: string[][], box: Box): string {
  return grid
    .slice(box.top + 1, box.bottom)
    .map(row => row.slice(box.left + 1, box.right).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nodeHue(index: number): string {
  return theme.diagramNodes[index % theme.diagramNodes.length] ?? theme.diagramText
}
