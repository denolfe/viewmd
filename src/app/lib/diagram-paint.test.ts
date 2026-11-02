import { describe, expect, test } from 'bun:test'
import { paintDiagram } from './diagram-paint'
import { renderAscii } from './preprocess'
import { theme } from '../styles/theme'
import type { DiagramRun } from './diagram-paint'

const render = (source: string): string => {
  const ascii = renderAscii(source)
  if (ascii === undefined) throw new Error(`diagram failed to render: ${source}`)
  return ascii
}

const FLOW = render('graph LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C(Done)\n  B -->|no| A')
const SUBGRAPH = render('graph TD\n  subgraph S [Group]\n    X --> Y\n  end\n  Y --> Z')
const SEQUENCE = render('sequenceDiagram\n  Alice->>Bob: Hi\n  Bob-->>Alice: Yo')

const [FIRST, SECOND, THIRD] = theme.diagramNodes

/** Per-cell fg, rebuilt from the runs so tests assert on what each glyph paints as. */
const colorGrid = (runs: DiagramRun[]): (string | undefined)[][] => {
  const grid: (string | undefined)[][] = [[]]
  for (const run of runs) {
    for (const ch of Array.from(run.text)) {
      if (ch === '\n') grid.push([])
      else grid[grid.length - 1]?.push(run.fg)
    }
  }
  return grid
}

/** Color of the nth occurrence of `needle` in the diagram text. */
const colorOf = (text: string, needle: string, nth = 0): string | undefined => {
  const lines = text.split('\n')
  let seen = 0
  for (let r = 0; r < lines.length; r++) {
    const chars = Array.from(lines[r] ?? '')
    for (let c = 0; c < chars.length; c++) {
      if (!chars.slice(c).join('').startsWith(needle)) continue
      if (seen++ === nth) return colorGrid(paintDiagram(text))[r]?.[c]
    }
  }
  throw new Error(`"${needle}" #${nth} not found`)
}

describe('paintDiagram', () => {
  test('run texts concatenate back to the input exactly', () => {
    for (const text of [FLOW, SUBGRAPH, SEQUENCE]) {
      expect(
        paintDiagram(text)
          .map(r => r.text)
          .join(''),
      ).toBe(text)
    }
  })

  test('a node box and its label share one palette hue', () => {
    expect(colorOf(FLOW, 'Start')).toBe(FIRST)
    expect(colorOf(FLOW, '┌')).toBe(FIRST)
    expect(colorOf(FLOW, '┘')).toBe(FIRST)
  })

  test('distinct labels take successive palette hues', () => {
    expect(colorOf(FLOW, 'Ok?')).toBe(SECOND)
    expect(colorOf(FLOW, 'Done')).toBe(THIRD)
  })

  test('a repeated label reuses its hue', () => {
    expect(colorOf(SEQUENCE, 'Alice', 0)).toBe(FIRST)
    expect(colorOf(SEQUENCE, 'Alice', 1)).toBe(FIRST)
    expect(colorOf(SEQUENCE, 'Bob', 1)).toBe(SECOND)
  })

  test('the palette wraps once every hue is taken', () => {
    const ids = 'ABCDEFG'.split('')
    const chain = render(`graph LR\n  ${ids.map(id => `${id}[N${id}]`).join(' --> ')}`)
    expect(colorOf(chain, `N${ids[theme.diagramNodes.length]}`)).toBe(FIRST)
  })

  test('a subgraph frame paints as a line and its title as text', () => {
    expect(colorOf(SUBGRAPH, '┌───────┐')).toBe(theme.diagramLine)
    expect(colorOf(SUBGRAPH, 'Group')).toBe(theme.diagramText)
    expect(colorOf(SUBGRAPH, 'X')).toBe(FIRST)
  })

  test('edges paint lines, arrowheads, and edge labels by role', () => {
    expect(colorOf(FLOW, '─yes')).toBe(theme.diagramLine)
    expect(colorOf(FLOW, '►')).toBe(theme.diagramArrow)
    expect(colorOf(FLOW, 'yes')).toBe(theme.diagramText)
    expect(colorOf(SEQUENCE, '▶')).toBe(theme.diagramArrow)
    expect(colorOf(SEQUENCE, '◀')).toBe(theme.diagramArrow)
  })
})
