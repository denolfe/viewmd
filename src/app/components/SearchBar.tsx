import { TextAttributes } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { findMatches } from '../lib/search'
import { theme } from '../styles/theme'
import type { Node } from '../lib/ast'

export function SearchBar({ nodes }: { nodes: Node[] }) {
  const { search, setSearch, setFocus, viewerRef, focus } = useAppState()
  const { width } = useTerminalDimensions()

  // Recompute from the input's current string: Enter arriving before React
  // re-renders must not commit a stale (truncated/empty) pattern.
  const applyPattern = (pattern: string, committed: boolean) => {
    if (!search) return
    const matches = findMatches(nodes, pattern)
    const index = matches.length
      ? (viewerRef.current?.seedMatchIndex({ matches, dir: search.dir }) ?? 0)
      : -1
    setSearch({ ...search, pattern, matches, index, committed })
  }

  const commit = (pattern: string) => {
    applyPattern(pattern, true)
    setFocus('viewer')
  }

  const onInput = (pattern: string) => {
    applyPattern(pattern, false)
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
  // Muted counter reads fine on the dark bar; on the red miss bar it would be
  // illegible, so fall back to the regular bar fg there.
  const counterFg = isMiss ? theme.searchBarFg : theme.foregroundMuted
  // Counter column: paddingX + label + pattern + cursor cell + one gap cell.
  // The typing-mode input stays full-width (sizing it to the pattern lets fast
  // typing outrun React's width updates, scrolling the buffer irrecoverably),
  // so the counter overlays it at a computed column instead of flowing after it.
  const counterLeft = 1 + label.length + search.pattern.length + 2
  const showCounter = counter.length > 0 && counterLeft + counter.length < width

  return (
    <box flexDirection="row" height={1} paddingX={1} backgroundColor={bg} position="relative">
      <text fg={theme.searchBarFg} attributes={TextAttributes.BOLD}>
        {label}
      </text>
      {isTyping ? (
        <box flexGrow={1}>
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
        </box>
      ) : (
        <text fg={theme.searchBarFg}>{search.pattern}</text>
      )}
      {showCounter && (
        <text position="absolute" left={counterLeft} fg={counterFg}>
          {counter}
        </text>
      )}
    </box>
  )
}
