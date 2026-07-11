import { test, expect } from 'bun:test'
import { blockId, computeTrackCells } from './scroll-marks'
import type { ResolvedMark } from './scroll-marks'

test('blockId joins a path with the blk- prefix', () => {
  expect(blockId([3])).toBe('blk-3')
  expect(blockId([5, 2, 0])).toBe('blk-5-2-0')
  expect(blockId([])).toBe('blk-')
})

test('maps y proportionally to a track row', () => {
  const marks: ResolvedMark[] = [
    { y: 0, kind: 'heading' },
    { y: 100, kind: 'heading' },
    { y: 50, kind: 'heading' },
  ]
  const cells = computeTrackCells({ marks, contentHeight: 100, trackHeight: 11 })
  const rows = cells.map(c => c.row).sort((a, b) => a - b)
  expect(rows).toEqual([0, 5, 10]) // round(y/100 * 10)
})

test('clamps rows into the track', () => {
  const marks: ResolvedMark[] = [
    { y: -20, kind: 'heading' },
    { y: 9999, kind: 'heading' },
  ]
  const cells = computeTrackCells({ marks, contentHeight: 100, trackHeight: 10 })
  expect(cells.map(c => c.row).sort((a, b) => a - b)).toEqual([0, 9])
})

test('collision priority is activeMatch > match > heading', () => {
  const marks: ResolvedMark[] = [
    { y: 0, kind: 'heading' },
    { y: 1, kind: 'match' },
    { y: 2, kind: 'activeMatch' },
  ]
  // contentHeight must exceed trackHeight to remain scrollable; kept large so all
  // three closely-spaced marks round onto the same track row (0).
  const cells = computeTrackCells({ marks, contentHeight: 10_000, trackHeight: 200 })
  const row0 = cells.filter(c => c.row === 0)
  expect(row0).toHaveLength(1)
  expect(row0[0]?.kind).toBe('activeMatch')
})

test('renders nothing when not scrollable', () => {
  const marks: ResolvedMark[] = [{ y: 5, kind: 'match' }]
  expect(computeTrackCells({ marks, contentHeight: 10, trackHeight: 10 })).toEqual([])
  expect(computeTrackCells({ marks, contentHeight: 100, trackHeight: 0 })).toEqual([])
})
