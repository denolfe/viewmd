import { useEffect, useState } from 'react'
import { useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { computeTrackCells } from '../lib/scroll-marks'
import type { MarkKind, TrackCell } from '../lib/scroll-marks'
import { theme } from '../styles/theme'

const TICK = '─'
const COLOR: Record<MarkKind, string> = {
  heading: theme.scrollMarkHeading,
  match: theme.scrollMarkMatch,
  activeMatch: theme.scrollMarkActive,
}

export function ScrollIndicators({ headingIds }: { headingIds: string[] }) {
  const { viewerRef, search, contentWidth } = useAppState()
  const { height } = useTerminalDimensions()
  const [cells, setCells] = useState<TrackCell[]>([])

  useEffect(() => {
    const tid = setTimeout(() => {
      const v = viewerRef.current
      if (!v) return
      const { marks, contentHeight, trackHeight } = v.getScrollMarks({
        headingIds,
        matches: search?.matches ?? [],
        pattern: search?.pattern ?? '',
        activeIndex: search?.index ?? -1,
      })
      setCells(computeTrackCells({ marks, contentHeight, trackHeight }))
    }, 0)
    return () => clearTimeout(tid)
  }, [viewerRef, headingIds, search?.pattern, search?.index, contentWidth, height])

  if (cells.length === 0) return null
  const byRow = new Map(cells.map(c => [c.row, c.kind]))
  return (
    <box position="absolute" right={0} top={0} width={1} height="100%">
      {Array.from({ length: height }, (_, row) => {
        const kind = byRow.get(row)
        return (
          <text key={row} fg={kind ? COLOR[kind] : undefined}>
            {kind ? TICK : ' '}
          </text>
        )
      })}
    </box>
  )
}
