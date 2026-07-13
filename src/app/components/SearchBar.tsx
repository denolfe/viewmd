import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import { useAppState } from '../state'
import { findMatches } from '../lib/search'
import { theme } from '../styles/theme'
import type { Node } from '../lib/ast'

export function SearchBar({ nodes }: { nodes: Node[] }) {
  const { search, setSearch, setFocus, viewerRef, focus } = useAppState()

  // Recompute from the submitted value: Enter arriving before React re-renders
  // must not commit a stale (truncated/empty) pattern.
  const commit = (pattern: string) => {
    if (!search) return
    const matches = findMatches(nodes, pattern)
    const index = matches.length
      ? (viewerRef.current?.seedMatchIndex({ matches, pattern, dir: search.dir }) ?? 0)
      : -1
    setSearch({ ...search, pattern, matches, index, committed: true })
    setFocus('viewer')
  }

  const onInput = (pattern: string) => {
    if (!search) return
    const matches = findMatches(nodes, pattern)
    const index = matches.length
      ? (viewerRef.current?.seedMatchIndex({ matches, pattern, dir: search.dir }) ?? 0)
      : -1
    setSearch({ ...search, pattern, matches, index, committed: false })
  }

  useKeyboard(ev => {
    if (focus !== 'search') return // committed-mode keys go through mapKey/dispatch
    if (ev.name === 'escape') {
      setSearch(null)
      setFocus('viewer')
    }
  })

  if (!search) return null

  const isTyping = focus === 'search'
  const hasPattern = search.pattern.length > 0
  const isMiss = hasPattern && search.matches.length === 0
  const bg = isMiss ? theme.searchBarNoMatchBg : theme.searchBarBg
  const label = search.dir === 'forward' ? 'search: ' : 'search↑: '
  const counter = hasPattern
    ? `${search.matches.length ? search.index + 1 : 0} of ${search.matches.length}`
    : ''

  return (
    <box flexDirection="row" height={1} paddingX={1} backgroundColor={bg}>
      <text fg={theme.searchBarFg} attributes={TextAttributes.BOLD}>
        {label}
      </text>
      <box flexGrow={1}>
        {isTyping ? (
          <input
            focused
            backgroundColor={bg}
            focusedBackgroundColor={bg}
            textColor={theme.searchBarFg}
            focusedTextColor={theme.searchBarFg}
            onInput={onInput}
            // The prop's type also admits Textarea's SubmitEvent (not exported
            // by @opentui/core); at runtime the input's ENTER event always
            // emits its current string value.
            onSubmit={(value: unknown) => {
              if (typeof value === 'string') commit(value)
            }}
          />
        ) : (
          <text fg={theme.searchBarFg}>{search.pattern}</text>
        )}
      </box>
      <text fg={theme.searchBarFg}>{counter}</text>
    </box>
  )
}
