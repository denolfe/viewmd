import { useEffect, useState } from 'react'
import { useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { computeThumbRows, computeTrackCells } from '../lib/scroll-marks'
import type { MarkKind, ThumbRows, TrackCell } from '../lib/scroll-marks'
import { theme } from '../styles/theme'

const TICK = '─'
const MULTI_TICK = '═'
const COLOR: Record<MarkKind, string> = {
  match: theme.scrollMarkMatch,
  activeMatch: theme.scrollMarkActive,
}

export function ScrollIndicators() {
  const { viewerRef, search, contentWidth } = useAppState()
  const { height } = useTerminalDimensions()
  const [cells, setCells] = useState<TrackCell[]>([])
  const [thumb, setThumb] = useState<ThumbRows | null>(null)
  const [trackRows, setTrackRows] = useState(0)

  useEffect(() => {
    const recompute = () => {
      const v = viewerRef.current
      if (!v) return
      const geo = v.getScrollMarks({
        matches: search?.matches ?? [],
        pattern: search?.pattern ?? '',
        activeIndex: search?.index ?? -1,
      })
      setCells(computeTrackCells(geo))
      setThumb(computeThumbRows(geo))
      setTrackRows(geo.viewportHeight)
    }
    // Defer past the current commit so the scrollbox has laid out.
    const tid = setTimeout(recompute, 0)
    // Thumb rows shift as the user scrolls; marks are document-space and don't.
    const unsubscribe = viewerRef.current?.subscribeScroll(recompute)
    return () => {
      clearTimeout(tid)
      unsubscribe?.()
    }
  }, [viewerRef, search?.pattern, search?.index, contentWidth, height])

  if (cells.length === 0) return null
  const byRow = new Map(cells.map(c => [c.row, c]))
  // Marker cells adopt the bg of whatever they cover — thumb or track — so
  // they read as painted on the bar; unmarked rows stay transparent so the
  // real scrollbar shows through. Row count must match the track exactly:
  // extra children make yoga shrink the column and shift every row up one.
  return (
    <box position="absolute" right={0} top={0} width={1} height="100%">
      {Array.from({ length: trackRows }, (_, row) => {
        const cell = byRow.get(row)
        const isOnThumb = thumb !== null && row >= thumb.start && row <= thumb.end
        return (
          <text
            key={row}
            bg={cell ? (isOnThumb ? theme.scrollbarThumb : theme.scrollbarTrack) : undefined}
            fg={cell ? COLOR[cell.kind] : undefined}
          >
            {cell ? (cell.count > 1 ? MULTI_TICK : TICK) : ' '}
          </text>
        )
      })}
    </box>
  )
}
