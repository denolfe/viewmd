import { test, expect } from 'bun:test'
import { blockId, computeTrackCells } from './scroll-marks'
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
