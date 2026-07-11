import { useEffect, useState } from 'react'
import { useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { computeThumbRows, computeTrackCells } from '../lib/scroll-marks'
import type { MarkKind, ThumbRows, TrackCell } from '../lib/scroll-marks'
import { theme } from '../styles/theme'

const TICK = '─'
const COLOR: Record<MarkKind, string> = {
  match: theme.scrollMarkMatch,
  activeMatch: theme.scrollMarkActive,
}

export function ScrollIndicators() {
  const { viewerRef, search, contentWidth } = useAppState()
  const { height } = useTerminalDimensions()
  const [cells, setCells] = useState<TrackCell[]>([])
  const [thumb, setThumb] = useState<ThumbRows | null>(null)

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
  const byRow = new Map(cells.map(c => [c.row, c.kind]))
  // Marker cells adopt the bg of whatever they cover — thumb or track — so
  // they read as painted on the bar; unmarked rows stay transparent so the
  // real scrollbar shows through.
  return (
    <box position="absolute" right={0} top={0} width={1} height="100%">
      {Array.from({ length: height }, (_, row) => {
        const kind = byRow.get(row)
        const isOnThumb = thumb !== null && row >= thumb.start && row <= thumb.end
        return (
          <text
            key={row}
            bg={kind ? (isOnThumb ? theme.scrollbarThumb : theme.scrollbarTrack) : undefined}
            fg={kind ? COLOR[kind] : undefined}
          >
            {kind ? TICK : ' '}
          </text>
        )
      })}
    </box>
  )
}
