import type { InlineNode, TocEntry } from './ast'

/** Id of the synth-root row, so a click on it can be routed like a heading. */
export const FILE_ROW_ID = '\x00file-root'

/** One row of the sticky overlay's ancestor stack. */
export type AncestorRow =
  | { id: string; variant: 'pill'; inline: InlineNode[] }
  | { id: string; variant: 'muted'; level: number; inline: InlineNode[] }

/**
 * Ancestor stack for the current heading: the chain minus every ancestor whose
 * own box is on-screen. Both the renderer and the fold-offset math consume it,
 * so the rows shown and the rows the overlay occludes can never disagree.
 */
export function ancestorRows(params: {
  chain: TocEntry[]
  visibleHeadingIds: Set<string>
  hasH1: boolean
  fileLabel?: string
}): AncestorRow[] {
  const { chain, visibleHeadingIds, hasH1, fileLabel } = params
  const ancestors = chain.filter(e => !visibleHeadingIds.has(e.id))
  if (ancestors.length === 0) return []

  const rows: AncestorRow[] = []
  if (!hasH1 && fileLabel) {
    rows.push({ id: FILE_ROW_ID, variant: 'pill', inline: [{ kind: 'text', value: fileLabel }] })
  }
  for (const c of ancestors) {
    if (hasH1 && c.level === 1) rows.push({ id: c.id, variant: 'pill', inline: c.inline })
    else rows.push({ id: c.id, variant: 'muted', level: c.level, inline: c.inline })
  }
  return rows
}

/** Root→target lineage of `id`, target included. Empty when `id` is absent. */
export function ancestorChain(toc: TocEntry[], id: string | null): TocEntry[] {
  if (!id) return []
  const path: TocEntry[] = []
  const walk = (entries: TocEntry[]): boolean => {
    for (const e of entries) {
      path.push(e)
      if (e.id === id) return true
      if (walk(e.children)) return true
      path.pop()
    }
    return false
  }
  return walk(toc) ? path : []
}

/** True when the document contains an H1 anywhere (not only as its first heading). */
export function documentHasH1(toc: TocEntry[]): boolean {
  return toc.some(e => e.level === 1)
}

/** The overlay's Trail occupies exactly one row whenever a back stack exists. */
export function trailRowsForDepth(historyDepth: number): number {
  return historyDepth > 0 ? 1 : 0
}
