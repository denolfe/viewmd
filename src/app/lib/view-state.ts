import { useCallback, useMemo, useState } from 'react'
import type { SearchState } from '../state'
import type { TocEntry } from './ast'
import type { Focus } from './keys'
import { toggleTocExpanded } from './toc-util'

export type ViewState = {
  focus: Focus
  currentHeadingId: string | null
  visibleHeadingIds: Set<string>
  expanded: Map<string, boolean>
  tocCursorId: string | null
  search: SearchState | null
  tocVisible: boolean
  helpVisible: boolean
  mouseEnabled: boolean
}

export type ViewActions = {
  focus: (f: Focus) => void
  currentHeadingId: (id: string | null) => void
  visibleHeadingIds: (s: Set<string>) => void
  tocCursorId: (id: string | null) => void
  search: (s: SearchState | null) => void
  setExpanded: (m: Map<string, boolean>) => void
  toggleExpanded: (params: { toc: TocEntry[]; id: string }) => void
  toggleMouse: () => void
  toggleTocVisible: () => void
  toggleHelp: () => void
}

export function useViewState({ seedVisible }: { seedVisible: Set<string> }): {
  state: ViewState
  actions: ViewActions
} {
  const [state, setState] = useState<ViewState>(() => ({
    focus: 'viewer',
    currentHeadingId: null,
    visibleHeadingIds: seedVisible,
    expanded: new Map(),
    tocCursorId: null,
    search: null,
    tocVisible: true,
    helpVisible: false,
    mouseEnabled: false,
  }))

  const focus = useCallback((f: Focus) => setState(s => ({ ...s, focus: f })), [])
  const currentHeadingId = useCallback(
    (id: string | null) => setState(s => ({ ...s, currentHeadingId: id })),
    [],
  )
  const visibleHeadingIds = useCallback(
    (v: Set<string>) => setState(s => ({ ...s, visibleHeadingIds: v })),
    [],
  )
  const tocCursorId = useCallback(
    (id: string | null) => setState(s => ({ ...s, tocCursorId: id })),
    [],
  )
  const search = useCallback((v: SearchState | null) => setState(s => ({ ...s, search: v })), [])
  const setExpanded = useCallback(
    (m: Map<string, boolean>) => setState(s => ({ ...s, expanded: m })),
    [],
  )
  const toggleExpanded = useCallback(
    ({ toc, id }: { toc: TocEntry[]; id: string }) =>
      setState(s => ({ ...s, expanded: toggleTocExpanded({ toc, expanded: s.expanded, id }) })),
    [],
  )
  const toggleMouse = useCallback(
    () => setState(s => ({ ...s, mouseEnabled: !s.mouseEnabled })),
    [],
  )
  const toggleTocVisible = useCallback(
    () => setState(s => ({ ...s, tocVisible: !s.tocVisible })),
    [],
  )
  const toggleHelp = useCallback(() => setState(s => ({ ...s, helpVisible: !s.helpVisible })), [])

  const actions = useMemo<ViewActions>(
    () => ({
      focus,
      currentHeadingId,
      visibleHeadingIds,
      tocCursorId,
      search,
      setExpanded,
      toggleExpanded,
      toggleMouse,
      toggleTocVisible,
      toggleHelp,
    }),
    [
      focus,
      currentHeadingId,
      visibleHeadingIds,
      tocCursorId,
      search,
      setExpanded,
      toggleExpanded,
      toggleMouse,
      toggleTocVisible,
      toggleHelp,
    ],
  )

  return { state, actions }
}
