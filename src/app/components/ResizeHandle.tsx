import { useState } from 'react'
import type { MouseEvent } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { theme } from '../styles/theme'

type ResizeHandleProps = {
  /** Forwards a mousedown on the seam to `App`, which owns start/reset/double-click. */
  onSeamMouseDown: (event: MouseEvent) => void
}

/**
 * Invisible 1-col grab zone overlaid on the content/TOC seam (the sidebar's left
 * edge). Absolute positioning keeps it out of flex layout so it costs no column.
 * Hover reveals a thin bar so the otherwise-invisible zone is discoverable.
 *
 * It only forwards the mousedown; `App` owns the resize/reset/double-click logic
 * and the drag stream (see the drag shield in `App`). OpenTUI binds drag-capture
 * to the hit-target of the *first* drag event, and a real terminal's first motion
 * already leaves this 1-col strip — so the handle cannot reliably receive the
 * drag events itself.
 */
export function ResizeHandle({ onSeamMouseDown }: ResizeHandleProps) {
  const { height: termHeight } = useTerminalDimensions()
  const [isHovered, setIsHovered] = useState(false)

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={1}
      height="100%"
      backgroundColor={isHovered ? theme.tocFocusBg : undefined}
      onMouseDown={onSeamMouseDown}
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
