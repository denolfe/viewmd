import { MouseButton } from '@opentui/core'
import type { MouseEvent } from '@opentui/core'

/**
 * Wraps a click handler so it fires only for the primary (left) mouse button,
 * stopping propagation first. Returns an `onMouseDown` handler.
 */
export const onPrimaryClick = (handler: () => void) => (event: MouseEvent) => {
  if (event.button !== MouseButton.LEFT) return
  event.stopPropagation()
  handler()
}
