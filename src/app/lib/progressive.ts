// Cheap, LOW-biased height estimates for progressive mounting. Underestimating
// is safe (the prefix mounts a few extra nodes; the spacer runs slightly
// short); overestimating leaves blank rows on first paint and overshoots the
// `--render` cap.
import { inlineVisibleWidth } from './inline-width'
import type { ListItem, Node } from './ast'

/** Nodes appended per growth tick after first paint. */
export const CHUNK_SIZE = 32

/** Viewport multiplier for the initial prefix — buffer against estimate error. */
const INITIAL_VIEWPORT_FACTOR = 2

export function initialMountCount(params: {
  nodes: Node[]
  contentWidth: number
  viewportHeight: number
}): number {
  const { nodes, contentWidth, viewportHeight } = params
  return sliceCountForRows({
    nodes,
    contentWidth,
    rows: viewportHeight * INITIAL_VIEWPORT_FACTOR,
  })
}

/** Smallest prefix length whose cumulative estimate reaches `rows` (all if never). */
export function sliceCountForRows(params: {
  nodes: Node[]
  contentWidth: number
  rows: number
}): number {
  const { nodes, contentWidth, rows } = params
  let acc = 0
  for (const [i, n] of nodes.entries()) {
    acc += estimateNodeRows(n, contentWidth)
    if (acc >= rows) return i + 1
  }
  return nodes.length
}

export function estimateTotalRows(nodes: Node[], contentWidth: number): number {
  let total = 0
  for (const n of nodes) total += estimateNodeRows(n, contentWidth)
  return total
}

export function estimateNodeRows(node: Node, contentWidth: number): number {
  switch (node.kind) {
    case 'space':
    case 'hr':
      return 1
    case 'heading':
      return 2 // text + margin (h1 adds marginTop too — low bias)
    case 'paragraph':
      return Math.max(1, Math.ceil(inlineVisibleWidth(node.inline) / Math.max(1, contentWidth)))
    case 'code': {
      const lines = node.value.split('\n').length
      // Mermaid renders bare (no frame); others add border (2) + paddingY (2).
      return node.lang === 'mermaid' ? lines : lines + 4
    }
    case 'table':
      return node.rows.length + 3 // header + separator + borders, minimum
    case 'list':
      return node.items.reduce((sum, item) => sum + estimateItemRows(item, contentWidth), 0)
    case 'blockquote':
      return Math.max(1, estimateTotalRows(node.children, contentWidth))
    case 'details':
      return estimateTotalRows(node.children, contentWidth) + 2
    case 'html':
      return Math.max(1, node.value.split('\n').length)
    case 'image':
      return 1
  }
}

function estimateItemRows(item: ListItem, contentWidth: number): number {
  return Math.max(1, estimateTotalRows(item.children, contentWidth))
}
