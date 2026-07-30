import { describe, expect, mock, test } from 'bun:test'
import { createMarkCache } from './mark-cache'
import type { Match } from './search'
import type { ResolvedMark } from './scroll-marks'

const match = (start: number): Match => ({
  blockPath: [0],
  blockElementId: 'blk',
  runKey: 'r0',
  start,
  length: 1,
})

describe('createMarkCache', () => {
  test('resolves once for repeated reads at the same matches and reflow key', () => {
    const resolve = mock((): ResolvedMark[] => [{ y: 5, matchIndex: 0 }])
    const cache = createMarkCache({ resolve, reflowKey: () => 'a' })
    const matches = [match(0)]
    cache.read(matches)
    cache.read(matches)
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  test('re-resolves when the reflow key changes', () => {
    const resolve = mock((): ResolvedMark[] => [])
    let key = 'a'
    const cache = createMarkCache({ resolve, reflowKey: () => key })
    const matches = [match(0)]
    cache.read(matches)
    key = 'b'
    cache.read(matches)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  test('re-resolves for a new array with equal contents, because identity is the grain', () => {
    const resolve = mock((): ResolvedMark[] => [])
    const cache = createMarkCache({ resolve, reflowKey: () => 'a' })
    cache.read([match(0)])
    cache.read([match(0)])
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  test('returns the cached array itself on a hit', () => {
    const marks: ResolvedMark[] = [{ y: 9, matchIndex: 3 }]
    const cache = createMarkCache({ resolve: () => marks, reflowKey: () => 'a' })
    const matches = [match(0)]
    expect(cache.read(matches)).toBe(marks)
    expect(cache.read(matches)).toBe(marks)
  })

  test('a miss replaces the entry rather than accumulating', () => {
    const resolve = mock((): ResolvedMark[] => [])
    const cache = createMarkCache({ resolve, reflowKey: () => 'a' })
    const a = [match(0)]
    const b = [match(1)]
    cache.read(a)
    cache.read(b)
    cache.read(a)
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  test('resolve receives the matches it was asked about', () => {
    const resolve = mock((): ResolvedMark[] => [])
    const cache = createMarkCache({ resolve, reflowKey: () => 'a' })
    const matches = [match(0)]
    cache.read(matches)
    expect(resolve).toHaveBeenCalledWith(matches)
  })
})
