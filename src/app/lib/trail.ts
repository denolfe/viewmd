export type CrumbKind = 'current' | 'back' | 'past' | 'ellipsis'
/** `index` is the crumb's position in the source label chain (its navigation target); `-1` for the ellipsis. */
export type Crumb = { label: string; kind: CrumbKind; index: number }

const SEP = ' › '
const ELLIPSIS = '…'
const UNTITLED = '<untitled>'

/**
 * Maps an ordered list of document labels (origin first, current doc last) into
 * tagged breadcrumb crumbs. When the chain joined by " › " exceeds `maxWidth`,
 * the middle collapses to a single ellipsis crumb, always keeping the first
 * crumb and the last two (the immediate-previous `back` crumb and the `current` doc).
 */
export function documentTrail({
  labels,
  maxWidth,
}: {
  labels: (string | undefined)[]
  maxWidth: number
}): Crumb[] {
  const named = labels.map(label => label ?? UNTITLED)
  if (named.length === 0) return []

  const full = named.map((label, i): Crumb => ({ label, kind: tagAt(i, named.length), index: i }))
  if (named.length <= 3 || trailWidth(full) <= maxWidth) return full

  const first = full[0]
  const back = full[full.length - 2]
  const current = full[full.length - 1]
  if (!first || !back || !current) return full

  return [first, { label: ELLIPSIS, kind: 'ellipsis', index: -1 }, back, current]
}

function tagAt(i: number, n: number): CrumbKind {
  if (i === n - 1) return 'current'
  if (i === n - 2) return 'back'
  return 'past'
}

function trailWidth(crumbs: Crumb[]): number {
  const labelWidth = crumbs.reduce((sum, c) => sum + c.label.length, 0)
  const sepWidth = Math.max(0, crumbs.length - 1) * SEP.length
  return labelWidth + sepWidth
}
