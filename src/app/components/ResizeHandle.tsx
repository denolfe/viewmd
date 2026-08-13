import { useRef, useState } from 'react'
import { MouseButton } from '@opentui/core'
import type { MouseEvent } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { isDoubleClick } from '../lib/sidebar-resize'
import { theme } from '../styles/theme'

type ResizeHandleProps = {
  /** Begin a drag-resize (left mousedown on the handle, not a double-click). */
  onResizeStart: () => void
  /** Clear the width override back to auto (double-click on the handle). */
  onReset: () => void
}

/**
 * Invisible 1-col grab zone overlaid on the sidebar's left edge. Absolute
 * positioning keeps it out of flex layout so it costs no column. Hover reveals
 * a thin bar so the otherwise-invisible zone is discoverable.
 *
 * The handle only STARTS the resize on mousedown; the drag stream itself is
 * tracked by a full-width ancestor (see App). OpenTUI binds drag-capture to the
 * hit-target of the *first* drag event, and a real terminal's first motion
 * already leaves this 1-col strip — so the handle cannot reliably receive the
 * drag events itself. Double-click clears the override back to auto width.
 */
export function ResizeHandle({ onResizeStart, onReset }: ResizeHandleProps) {
  const { height: termHeight } = useTerminalDimensions()
  const [isHovered, setIsHovered] = useState(false)
  const lastDownAtRef = useRef<number | null>(null)

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== MouseButton.LEFT) return
    event.stopPropagation()
    const now = Date.now()
    if (isDoubleClick({ now, lastDownAt: lastDownAtRef.current })) {
      onReset()
      lastDownAtRef.current = null
      return
    }
    lastDownAtRef.current = now
    onResizeStart()
  }

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={1}
      height="100%"
      backgroundColor={isHovered ? theme.tocFocusBg : undefined}
      onMouseDown={onMouseDown}
      onMouseOver={() => setIsHovered(true)}
      onMouseOut={() => setIsHovered(false)}
    >
      {/* Text is selectable by default; a mousedown on selectable content
          starts a text selection that hijacks the drag stream. Opt out so the
          mousedown cleanly starts our resize instead. Width:1 wraps one char
          per row, so repeating the glyph fills the column's full height;
          overflow beyond the box is clipped. */}
      <text selectable={false} fg={theme.foregroundMuted}>
        {(isHovered ? '▏' : ' ').repeat(termHeight)}
      </text>
    </box>
  )
}
