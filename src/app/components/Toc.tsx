import { useLayoutEffect, useMemo, useRef } from 'react'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import type { ScrollBoxRenderable } from '@opentui/core'
import { useAppState, useHeadingState } from '../state'
import { flattenVisible, isTocExpanded } from '../lib/toc-util'
import { onPrimaryClick } from '../lib/mouse'
import { theme } from '../styles/theme'
import type { TocEntry } from '../lib/ast'
import { MutedInline } from './blocks/MutedInline'
import { useProgressiveCount } from './useProgressiveCount'

/** Screenfuls of rows in the first paint; a buffer against wrapped rows undercounting. */
const INITIAL_SCREENS = 2

export function Toc({
  toc,
  onEntryJump,
  onEntryToggle,
}: {
  toc: TocEntry[]
  onEntryJump: (id: string) => void
  onEntryToggle: (id: string) => void
}) {
  const { expanded, tocCursorId, focus } = useAppState()
  const { currentHeadingId } = useHeadingState()
  const visible = useMemo(() => flattenVisible(toc, expanded), [toc, expanded])
  const renderer = useRenderer()
  const { height } = useTerminalDimensions()
  const boxRef = useRef<ScrollBoxRenderable | null>(null)

  // Every row is several renderables, so a doc with hundreds of headings would
  // otherwise pay for the whole sidebar before first paint. Rows are one line
  // each unless a heading wraps, so `height` rows is a low-biased screenful;
  // the spacer keeps the sidebar scrollbar honest while the tail mounts.
  const mountedCount = useProgressiveCount({
    total: visible.length,
    initial: () => height * INITIAL_SCREENS,
    resetKey: toc,
  })
  const rows = mountedCount < visible.length ? visible.slice(0, mountedCount) : visible

  // On mount, scrollSize is set before viewportSize settles, so auto-visibility
  // recalculates with garbage metrics and the bar flashes visible for one
  // frame. Force it hidden until the renderer's next post-layout frame, then
  // hand control back to the normal auto-visibility logic.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.verticalScrollBar.visible = false
    const onFrame = () => {
      box.verticalScrollBar.resetVisibilityControl()
      renderer.off('frame', onFrame)
    }
    renderer.on('frame', onFrame)
    return () => {
      renderer.off('frame', onFrame)
    }
  }, [renderer])

  return (
    <scrollbox ref={boxRef} flexGrow={1} focusable={false} paddingX={1} paddingTop={1}>
      {rows.map(e => {
        const isExpanded = isTocExpanded(e, expanded)
        const hasChildren = e.children.length > 0
        const marker = hasChildren ? (isExpanded ? '▾' : '▸') : '•'
        const indent = '  '.repeat(Math.max(0, e.level - 1))
        const isCurrent = e.id === currentHeadingId
        const isCursor = focus === 'sidebar' && e.id === tocCursorId
        return (
          <box
            key={e.id}
            id={tocRowId(e.id)}
            flexDirection="row"
            backgroundColor={isCursor ? theme.tocFocusBg : undefined}
          >
            <text
              fg={isCurrent ? theme.tocCurrent : theme.foregroundMuted}
              onMouseDown={onPrimaryClick(() =>
                hasChildren ? onEntryToggle(e.id) : onEntryJump(e.id),
              )}
            >
              {indent}
              {marker}{' '}
            </text>
            <box flexGrow={1} onMouseDown={onPrimaryClick(() => onEntryJump(e.id))}>
              <text fg={isCurrent ? theme.tocCurrent : theme.foregroundMuted}>
                {/* Current entry: bold emphasis on top of the tocCurrent color (bold is idempotent over nested <strong>). */}
                {isCurrent ? (
                  <strong>
                    <MutedInline nodes={e.inline} />
                  </strong>
                ) : (
                  <MutedInline nodes={e.inline} />
                )}
              </text>
            </box>
          </box>
        )
      })}
      {rows.length < visible.length && <box height={visible.length - rows.length} />}
    </scrollbox>
  )
}

/** Renderable id of a TOC row, so tests and tree walks can find mounted rows. */
export function tocRowId(entryId: string): string {
  return `toc-row:${entryId}`
}
