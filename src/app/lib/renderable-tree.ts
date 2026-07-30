import type { TextBearer } from './viewport-geometry'

/** Minimal structural view of a renderable, for id and geometry walks. */
export type TreeNode = { getChildren(): unknown[]; id?: unknown; y?: number; height?: number }

/**
 * `collect` applied to every `wanted` id found beneath `root`, in one walk.
 * Prunes as soon as the set is exhausted, and stops at a matched box without
 * descending into it: ids are block-level and never nest inside one another.
 */
export function collectById<T>(params: {
  root: { getChildren(): unknown[] }
  wanted: Set<string>
  collect: (node: TreeNode) => T
}): Map<string, T> {
  const { wanted, collect } = params
  const out = new Map<string, T>()
  const walk = (node: { getChildren(): unknown[] }): void => {
    for (const child of node.getChildren()) {
      if (wanted.size === 0) return
      if (!isTreeNode(child)) continue
      const id = typeof child.id === 'string' ? child.id : undefined
      if (id !== undefined && wanted.delete(id)) {
        out.set(id, collect(child))
        continue
      }
      walk(child)
    }
  }
  walk(params.root)
  return out
}

/**
 * All text-bearing descendants in tree order. Multi-text blocks (tables,
 * blockquotes) render one text renderable per cell/paragraph; element-ordinal
 * indexing must span them all to land on the right one.
 */
export function collectTextBearers(
  node: { getChildren(): unknown[] },
  out: TextBearer[],
): TextBearer[] {
  if (isTextBearer(node)) {
    out.push(node)
    return out
  }
  for (const child of node.getChildren()) {
    if (isTreeNode(child)) collectTextBearers(child, out)
  }
  return out
}

function isTreeNode(value: unknown): value is TreeNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getChildren' in value &&
    typeof value.getChildren === 'function'
  )
}

/**
 * A renderable that prints text. Field types are checked rather than just their
 * presence: a bearer with a non-numeric `y` resolves every match in it to a NaN row.
 */
function isTextBearer(value: unknown): value is TextBearer {
  if (typeof value !== 'object' || value === null) return false
  if (!('plainText' in value) || !('lineInfo' in value) || !('y' in value)) return false
  if (typeof value.plainText !== 'string' || typeof value.y !== 'number') return false
  const info = value.lineInfo
  if (typeof info !== 'object' || info === null || !('lineStartCols' in info)) return false
  return Array.isArray(info.lineStartCols)
}
