import { useCallback } from 'react'
import type { MouseEvent } from '@opentui/core'
import { MouseButton } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import { useAppState } from '../../state'
import { resolveLinkAtPoint } from '../../lib/link-hit'
import type { InlineNode } from '../../lib/ast'

/** The subset of a mouse event the link gate reads. Structurally satisfied by `MouseEvent`. */
type LinkClickEvent = {
  button: number
  x: number
  y: number
  target: { getChildren(): unknown[] } | null
}

/** onMouseDown handler that follows a link under the cursor. */
export function useLinkClick(inline: InlineNode[]): (event: MouseEvent) => void {
  const { commands } = useAppState()
  const renderer = useRenderer()
  return useCallback(
    (event: MouseEvent) => {
      const href = linkHrefForEvent({ event, inline })
      if (!href) return
      // OpenTUI anchors a text selection on mousedown before this handler runs;
      // clear it so a consumed link click doesn't leave a stray highlight.
      renderer.clearSelection()
      commands.followLink(href)
    },
    [commands.followLink, inline, renderer],
  )
}

/** Pure gate: the href a left-click lands on, or null. */
export function linkHrefForEvent(params: {
  event: LinkClickEvent
  inline: InlineNode[]
}): string | null {
  const { event, inline } = params
  if (event.button !== MouseButton.LEFT) return null
  const box = event.target
  if (!box) return null
  return resolveLinkAtPoint({ box, point: { x: event.x, y: event.y }, inline })
}
