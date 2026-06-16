import { createContext, useContext } from 'react'
import type { RefObject } from 'react'
import type { Match } from './search'
import type { Focus } from './keys'

// Scrollbox imperative API surface (subset of @opentui/core ScrollBoxRenderable)
export type ScrollboxHandle = {
  scrollBy: (delta: number) => void
  scrollTo: (y: number) => void
  scrollToBottom: () => void
  scrollChildIntoView: (childId: string) => void
}

export type AppState = {
  focus: Focus
  setFocus: (f: Focus) => void

  currentHeadingId: string | null
  setCurrentHeadingId: (id: string | null) => void

  // Imperative scroll: handler calls viewerRef.current?.scrollBy(...) etc.
  viewerRef: RefObject<ScrollboxHandle | null>

  expanded: Map<string, boolean>
  toggleExpanded: (id: string) => void

  tocCursorId: string | null
  setTocCursorId: (id: string | null) => void

  search: { pattern: string; matches: Match[]; index: number; dir: 'forward' | 'backward' } | null
  setSearch: (s: AppState['search']) => void

  mouseEnabled: boolean
  toggleMouse: () => void
}

export const AppStateContext = createContext<AppState | null>(null)

export function useAppState(): AppState {
  const s = useContext(AppStateContext)
  if (!s) throw new Error('AppStateContext missing')
  return s
}
