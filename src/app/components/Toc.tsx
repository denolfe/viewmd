import { useLayoutEffect, useRef } from 'react'
import { useRenderer } from '@opentui/react'
import type { MouseEvent, ScrollBoxRenderable } from '@opentui/core'
import { useAppState } from '../state'
import { flattenVisible, isTocExpanded } from '../lib/toc-util'
import { theme } from '../styles/theme'
import type { TocEntry } from '../lib/ast'
import { MutedInline } from './blocks/MutedInline'

export function Toc({
  toc,
  onEntryJump,
  onEntryToggle,
}: {
  toc: TocEntry[]
  onEntryJump: (id: string) => void
  onEntryToggle: (id: string) => void
}) {
  const { expanded, currentHeadingId, tocCursorId, focus } = useAppState()
  const visible = flattenVisible(toc, expanded)
  const renderer = useRenderer()
  const boxRef = useRef<ScrollBoxRenderable | null>(null)

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
      {visible.map(e => {
        const isExpanded = isTocExpanded(e, expanded)
        const hasChildren = e.children.length > 0
        const marker = hasChildren ? (isExpanded ? '▾' : '▸') : '•'
        const indent = '  '.repeat(Math.max(0, e.level - 1))
        const isCurrent = e.id === currentHeadingId
        const isCursor = focus === 'sidebar' && e.id === tocCursorId
        return (
          <box
            key={e.id}
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
    </scrollbox>
  )
}

const onPrimaryClick = (handler: () => void) => (event: MouseEvent) => {
  if (event.button !== 0) return
  event.stopPropagation()
  handler()
}
