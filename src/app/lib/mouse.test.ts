import { test, expect, mock } from 'bun:test'
import { MouseButton } from '@opentui/core'
import type { MouseEvent } from '@opentui/core'
import { onPrimaryClick } from './mouse'

function makeEvent(button: number): MouseEvent {
  return { button, stopPropagation: mock() } as unknown as MouseEvent
}

test('left click stops propagation and invokes the handler', () => {
  const handler = mock()
  const event = makeEvent(MouseButton.LEFT)
  onPrimaryClick(handler)(event)
  expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  expect(handler).toHaveBeenCalledTimes(1)
})

test('non-left click does nothing', () => {
  const handler = mock()
  const event = makeEvent(MouseButton.RIGHT)
  onPrimaryClick(handler)(event)
  expect(event.stopPropagation).not.toHaveBeenCalled()
  expect(handler).not.toHaveBeenCalled()
})
