import type { TocEntry } from './ast'

export function findAncestors(toc: TocEntry[], id: string): TocEntry[] {
  for (const e of toc) {
    if (e.id === id) return [e]
    const sub = findAncestors(e.children, id)
    if (sub.length) return [e, ...sub]
  }
  return []
}

export function flattenVisible(toc: TocEntry[], expanded: Map<string, boolean>): TocEntry[] {
  const out: TocEntry[] = []
  walk(toc, expanded, out)
  return out
}

function walk(entries: TocEntry[], expanded: Map<string, boolean>, out: TocEntry[]): void {
  for (const e of entries) {
    out.push(e)
    const isExpanded = expanded.get(e.id) ?? defaultExpanded(e)
    if (isExpanded && e.children.length) walk(e.children, expanded, out)
  }
}

function defaultExpanded(e: TocEntry): boolean {
  return e.level <= 2
}
