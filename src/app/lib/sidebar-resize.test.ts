import { test, expect } from 'bun:test'
import {
  sidebarWidthFromDragX,
  isDoubleClick,
  MIN_TOC_WIDTH,
  MIN_VIEWER_WIDTH,
  DOUBLE_CLICK_MS,
} from './sidebar-resize'

test('sidebarWidthFromDragX: mid-range width is termWidth - x', () => {
  expect(sidebarWidthFromDragX({ x: 70, termWidth: 100 })).toBe(30)
})

test('sidebarWidthFromDragX: clamps to MIN_TOC_WIDTH when dragged too far right', () => {
  expect(sidebarWidthFromDragX({ x: 98, termWidth: 100 })).toBe(MIN_TOC_WIDTH)
})

test('sidebarWidthFromDragX: clamps so the viewer keeps MIN_VIEWER_WIDTH cols', () => {
  expect(sidebarWidthFromDragX({ x: 1, termWidth: 100 })).toBe(100 - MIN_VIEWER_WIDTH)
})

test('sidebarWidthFromDragX: narrow terminals never invert the clamp', () => {
  expect(sidebarWidthFromDragX({ x: 5, termWidth: 30 })).toBe(MIN_TOC_WIDTH)
})

test('isDoubleClick: true when prior down is within the window', () => {
  expect(isDoubleClick({ now: 1000, lastDownAt: 1000 - (DOUBLE_CLICK_MS - 1) })).toBe(true)
})

test('isDoubleClick: false when prior down is too old', () => {
  expect(isDoubleClick({ now: 1000, lastDownAt: 1000 - (DOUBLE_CLICK_MS + 1) })).toBe(false)
})

test('isDoubleClick: false when there was no prior down', () => {
  expect(isDoubleClick({ now: 1000, lastDownAt: null })).toBe(false)
})
