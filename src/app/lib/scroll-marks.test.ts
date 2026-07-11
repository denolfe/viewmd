import { test, expect } from 'bun:test'
import { blockId, computeThumbRows, computeTrackCells } from './scroll-marks'
import type { ResolvedMark } from './scroll-marks'

test('blockId joins a path with the blk- prefix', () => {
  expect(blockId([3])).toBe('blk-3')
  expect(blockId([5, 2, 0])).toBe('blk-5-2-0')
  expect(blockId([])).toBe('blk-')
})

test('maps y over scrollHeight (thumb scale) to a track row', () => {
  const marks: ResolvedMark[] = [
    { y: 0, kind: 'match' },
    { y: 50, kind: 'match' },
    { y: 100, kind: 'match' },
  ]
  // round(y / scrollHeight * viewportHeight) = round(y / 110 * 11) = round(y / 10)
  const cells = computeTrackCells({
    marks,
    scrollHeight: 110,
    viewportHeight: 11,
    realContentHeight: 100,
  })
  const rows = cells.map(c => c.row).sort((a, b) => a - b)
  expect(rows).toEqual([0, 5, 10])
})

test('clamps rows into the track', () => {
  const marks: ResolvedMark[] = [
    { y: -20, kind: 'match' },
    { y: 9999, kind: 'match' },
  ]
  const cells = computeTrackCells({
    marks,
    scrollHeight: 100,
    viewportHeight: 10,
    realContentHeight: 90,
  })
  expect(cells.map(c => c.row).sort((a, b) => a - b)).toEqual([0, 9])
})

test('collision priority is activeMatch > match', () => {
  const marks: ResolvedMark[] = [
    { y: 0, kind: 'match' },
    { y: 2, kind: 'activeMatch' },
  ]
  // scrollHeight large so both marks round onto row 0.
  const cells = computeTrackCells({
    marks,
    scrollHeight: 10_000,
    viewportHeight: 200,
    realContentHeight: 9_000,
  })
  const row0 = cells.filter(c => c.row === 0)
  expect(row0).toHaveLength(1)
  expect(row0[0]?.kind).toBe('activeMatch')
})

test('counts marks collapsed onto a shared row', () => {
  const marks: ResolvedMark[] = [
    { y: 0, kind: 'match' },
    { y: 1, kind: 'match' },
    { y: 2, kind: 'match' },
    { y: 5_000, kind: 'match' },
  ]
  const cells = computeTrackCells({
    marks,
    scrollHeight: 10_000,
    viewportHeight: 200,
    realContentHeight: 9_000,
  })
  expect(cells.find(c => c.row === 0)?.count).toBe(3)
  expect(cells.find(c => c.row === 100)?.count).toBe(1)
})

test('renders nothing when the document fits the viewport or track is degenerate', () => {
  const marks: ResolvedMark[] = [{ y: 5, kind: 'match' }]
  // realContentHeight <= viewportHeight → not scrollable.
  expect(
    computeTrackCells({ marks, scrollHeight: 100, viewportHeight: 10, realContentHeight: 10 }),
  ).toEqual([])
  // Degenerate track height.
  expect(
    computeTrackCells({ marks, scrollHeight: 100, viewportHeight: 0, realContentHeight: 90 }),
  ).toEqual([])
})

// Geometry mirrors OpenTUI's vertical slider + installRealisticThumb:
// vps = round(vh·scrollH/real) = 55, virtualTrack = 98,
// S = floor(98·55/(398+55)) = 11, vStart = round(top/398·87).
const THUMB_GEO = { scrollHeight: 447, viewportHeight: 49, realContentHeight: 400 }

test('computeThumbRows places the thumb per the slider virtual-track math', () => {
  expect(computeThumbRows({ ...THUMB_GEO, scrollTop: 197 })).toEqual({ start: 21, end: 26 })
})

test('computeThumbRows pins the thumb to the track ends', () => {
  expect(computeThumbRows({ ...THUMB_GEO, scrollTop: 0 })).toEqual({ start: 0, end: 5 })
  // scrollTop at (or clamped to) range = scrollHeight - viewportHeight.
  expect(computeThumbRows({ ...THUMB_GEO, scrollTop: 398 })).toEqual({ start: 43, end: 48 })
  expect(computeThumbRows({ ...THUMB_GEO, scrollTop: 9999 })).toEqual({ start: 43, end: 48 })
})

test('computeThumbRows returns null when content is not scrollable', () => {
  expect(
    computeThumbRows({ scrollTop: 0, scrollHeight: 40, viewportHeight: 49, realContentHeight: 40 }),
  ).toBeNull()
  expect(
    computeThumbRows({ scrollTop: 0, scrollHeight: 100, viewportHeight: 0, realContentHeight: 90 }),
  ).toBeNull()
})
