import { test, expect } from 'bun:test'
import { contentWidthFromSeamX, isDoubleClick, DOUBLE_CLICK_MS } from './sidebar-resize'
import { VIEWER_OVERHEAD } from '../styles/layout'
import { MIN_CONTENT_WIDTH } from './config'

test('contentWidthFromSeamX: mid-range width is the seam column minus viewer overhead', () => {
  expect(contentWidthFromSeamX({ x: 100, termWidth: 200, tocWidth: 24 })).toBe(
    100 - VIEWER_OVERHEAD,
  )
})

test('contentWidthFromSeamX: clamps to MIN_CONTENT_WIDTH when dragged too far left', () => {
  expect(contentWidthFromSeamX({ x: 5, termWidth: 200, tocWidth: 24 })).toBe(MIN_CONTENT_WIDTH)
})

test('contentWidthFromSeamX: clamps so the auto-width TOC keeps its columns', () => {
  // Farthest-right seam leaves exactly termWidth - tocWidth - overhead for content.
  expect(contentWidthFromSeamX({ x: 500, termWidth: 200, tocWidth: 24 })).toBe(
    200 - 24 - VIEWER_OVERHEAD,
  )
})

test('contentWidthFromSeamX: narrow terminals never invert the clamp', () => {
  expect(contentWidthFromSeamX({ x: 5, termWidth: 30, tocWidth: 24 })).toBe(MIN_CONTENT_WIDTH)
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
