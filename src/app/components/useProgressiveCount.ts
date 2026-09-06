import { useEffect, useRef, useState } from 'react'
import { CHUNK_SIZE } from '../lib/progressive'

/**
 * Progressive-mount counter: starts at `initial()` and grows one chunk per
 * task until it reaches `total`, so a long list paints a prefix immediately
 * and fills in while keyboard/scroll stay live. Resets to `initial()` when
 * `resetKey` changes identity (a document swap).
 */
export function useProgressiveCount(params: {
  total: number
  initial: () => number
  resetKey: unknown
}): number {
  const { total, initial, resetKey } = params
  const [count, setCount] = useState(initial)

  // "Adjust state on prop change" during render — no stale frame, and the
  // host component instance (refs, listeners) is preserved across the swap.
  const prevKey = useRef(resetKey)
  if (prevKey.current !== resetKey) {
    prevKey.current = resetKey
    setCount(initial())
  }

  const isDone = count >= total

  // setTimeout(0) yields between commits so input handling interleaves.
  useEffect(() => {
    if (isDone) return
    const tid = setTimeout(() => {
      setCount(c => Math.min(c + CHUNK_SIZE, total))
    }, 0)
    return () => clearTimeout(tid)
  }, [isDone, count, total])

  return Math.min(count, total)
}
