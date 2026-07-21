import { test, expect } from 'bun:test'
import { MouseButton } from '@opentui/core'
import { linkHrefForEvent } from './useLinkClick'
import type { InlineNode } from '../../lib/ast'

const bearer = {
  screenX: 0,
  screenY: 0,
  plainText: 'see ./a.md now',
  lineInfo: { lineStartCols: [0], lineWidthCols: ['see ./a.md now'.length] },
  getChildren: () => [],
}
const box = { getChildren: () => [bearer] }
const inline: InlineNode[] = [
  { kind: 'text', value: 'see ' },
  { kind: 'link', href: './a.md', children: [{ kind: 'text', value: './a.md' }] },
  { kind: 'text', value: ' now' },
]

test('left-click over the link returns its href', () => {
  const event = { button: MouseButton.LEFT, x: 5, y: 0, target: box }
  expect(linkHrefForEvent({ event, inline })).toBe('./a.md')
})

test('left-click off the link returns null', () => {
  const event = { button: MouseButton.LEFT, x: 1, y: 0, target: box }
  expect(linkHrefForEvent({ event, inline })).toBeNull()
})

test('non-left button returns null', () => {
  const event = { button: MouseButton.RIGHT, x: 5, y: 0, target: box }
  expect(linkHrefForEvent({ event, inline })).toBeNull()
})

test('no target returns null', () => {
  const event = { button: MouseButton.LEFT, x: 5, y: 0, target: null }
  expect(linkHrefForEvent({ event, inline })).toBeNull()
})
