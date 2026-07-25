import { useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Ref that always holds the latest value, updated during render. Lets stable
 * callbacks read current state without being rebuilt on every change.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}
