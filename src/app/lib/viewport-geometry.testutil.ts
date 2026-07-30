import type { BoxGeometry, ChildGeometry, TextBearer } from './viewport-geometry'

/**
 * Positional `BoxGeometry` fake for unit tests. Heading y-positions are absolute;
 * `viewportTop` defaults to 0 so `topOffset` and `PIN_TOP_OFFSET` drive results.
 * Child height defaults to 1.
 */
export function makeGeometry(
  opts: {
    positions?: Record<string, { y: number; height?: number }>
    bearers?: Record<string, TextBearer[]>
    viewportTop?: number
    viewportHeight?: number
    scrollTop?: number
    scrollHeight?: number
  } = {},
): BoxGeometry {
  const positions = opts.positions ?? {}
  const bearers = opts.bearers ?? {}
  return {
    viewportTop: opts.viewportTop ?? 0,
    viewportHeight: opts.viewportHeight ?? 20,
    scrollTop: opts.scrollTop ?? 0,
    scrollHeight: opts.scrollHeight ?? 0,
    findChild: id => {
      const p = positions[id]
      return p ? { y: p.y, height: p.height ?? 1 } : null
    },
    findChildren: ids => {
      const out = new Map<string, ChildGeometry>()
      for (const id of ids) {
        const p = positions[id]
        if (p) out.set(id, { y: p.y, height: p.height ?? 1 })
      }
      return out
    },
    collectTextBearers: id => bearers[id] ?? [],
    collectTextBearersFor: ids => {
      const out = new Map<string, TextBearer[]>()
      for (const id of ids) {
        const b = bearers[id]
        if (b) out.set(id, b)
      }
      return out
    },
  }
}
