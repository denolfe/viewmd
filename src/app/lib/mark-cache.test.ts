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
  test('resolves once for repeated reads at the same matches and token', () => {
    const resolve = mock((): ResolvedMark[] => [{ y: 5, matchIndex: 0 }])
    const cache = createMarkCache(resolve)
    const matches = [match(0)]
    expect(cache.read({ matches, token: 1 })).toEqual([{ y: 5, matchIndex: 0 }])
    expect(cache.read({ matches, token: 1 })).toEqual([{ y: 5, matchIndex: 0 }])
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  test('re-resolves when the reflow token changes', () => {
    const resolve = mock((): ResolvedMark[] => [])
    const cache = createMarkCache(resolve)
    const matches = [match(0)]
    cache.read({ matches, token: 1 })
    cache.read({ matches, token: 2 })
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  test('re-resolves for a new array with equal contents, because identity is the grain', () => {
    const resolve = mock((): ResolvedMark[] => [])
    const cache = createMarkCache(resolve)
    cache.read({ matches: [match(0)], token: 1 })
    cache.read({ matches: [match(0)], token: 1 })
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  test('returns the cached array itself on a hit', () => {
    const marks: ResolvedMark[] = [{ y: 9, matchIndex: 3 }]
    const cache = createMarkCache(() => marks)
    const matches = [match(0)]
    expect(cache.read({ matches, token: 0 })).toBe(marks)
    expect(cache.read({ matches, token: 0 })).toBe(marks)
  })
})
