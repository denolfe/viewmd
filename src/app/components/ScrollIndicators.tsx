import { useEffect, useRef, useState } from 'react'
import { useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { computeThumbRows, computeTrackCells } from '../lib/scroll-marks'
import type { MarkKind, ResolvedMark, ThumbRows, TrackCell } from '../lib/scroll-marks'
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

  // Cached marks plus the content height they were resolved at, so a scroll can
  // tell "still valid" from "the content grew under me".
  const resolved = useRef<{ marks: ResolvedMark[]; contentHeight: number } | null>(null)

  // Everything that can move a mark. `search.index` is absent on purpose: it only
  // picks which tick paints as active.
  useEffect(() => {
    resolved.current = null
  }, [search?.pattern, contentWidth, height])

  useEffect(() => {
    const recompute = () => {
      const v = viewerRef.current
      if (!v) return
      const track = v.getTrackGeometry()
      // Marks are document-space, so only a reflow moves them, and every reflow
      // that matters (progressive mount, resize, reload) changes the real content
      // height. Gate on that, not `scrollHeight`: the tail shifts on nearly every row.
      if (resolved.current?.contentHeight !== track.realContentHeight) {
        const geo = v.getScrollMarks({ matches: search?.matches ?? [] })
        resolved.current = { marks: geo.marks, contentHeight: geo.realContentHeight }
      }
      // Cheap arithmetic, so re-run every time: cell rows scale by `scrollHeight`.
      setCells(
        computeTrackCells({
          ...track,
          marks: resolved.current.marks,
          activeIndex: search?.index ?? -1,
        }),
      )
      setThumb(computeThumbRows(track))
      setTrackRows(track.viewportHeight)
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
