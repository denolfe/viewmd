import { renderAscii } from './preprocess'
import type { Node } from './ast'
import type { DiagramSpacing } from './preprocess'

type CodeNode = Extract<Node, { kind: 'code' }>

/** Columns left bare on each side of a rendered diagram. */
export const DIAGRAM_MARGIN_X = 2

/**
 * Tighter spacings, loosest first: the gap between nodes shrinks before the
 * blank rows inside boxes go. Only flowchart and state layouts respond; other
 * diagram kinds render the same at every step.
 */
const COMPACT_STEPS: DiagramSpacing[] = [
  { paddingX: 3, boxBorderPadding: 1 },
  { paddingX: 2, boxBorderPadding: 1 },
  { paddingX: 2, boxBorderPadding: 0 },
  { paddingX: 1, boxBorderPadding: 0 },
]

/**
 * The text a code block prints at `contentWidth`. A diagram wider than the
 * column re-renders at the loosest spacing that fits; when none fits, the
 * tightest render wins so the least is clipped. `CodeBlock`, the search
 * Projection, and row estimates all read through here so they agree.
 */
export function codeText({ node, contentWidth }: { node: CodeNode; contentWidth: number }): string {
  const available = contentWidth - 2 * DIAGRAM_MARGIN_X
  if (node.diagramSource === undefined || textWidth(node.value) <= available) return node.value
  const renders = compactRenders(node, node.diagramSource)
  return renders.find(r => textWidth(r) <= available) ?? renders.at(-1) ?? node.value
}

// Keyed on the node so renders live and die with their Document.
const compactCache = new WeakMap<CodeNode, string[]>()

function compactRenders(node: CodeNode, source: string): string[] {
  const cached = compactCache.get(node)
  if (cached) return cached
  const renders = COMPACT_STEPS.map(spacing => renderAscii(source, spacing)).filter(
    (r): r is string => r !== undefined,
  )
  compactCache.set(node, renders)
  return renders
}

function textWidth(text: string): number {
  return text.split('\n').reduce((max, l) => Math.max(max, l.length), 0)
}
