import { useKeyboard } from '@opentui/react'
import { useAppState } from '../state'
import { findMatches } from '../lib/search'
import { theme } from '../styles/theme'
import type { Node } from '../lib/ast'

export function SearchInput({ nodes }: { nodes: Node[] }) {
  const { search, setSearch, setFocus, viewerRef } = useAppState()

  // Commit from the input's submit event: the pattern comes straight from the
  // input renderable's buffer, so Enter arriving before React re-renders can't
  // commit a stale (truncated/empty) pattern.
  const commit = (pattern: string) => {
    if (!search) return
    const matches = findMatches(nodes, pattern)
    // Seed at the first visible match (view stays put), else the nearest match
    // in the search direction — not blindly at the document's first match.
    const index = matches.length
      ? (viewerRef.current?.seedMatchIndex({ matches, pattern, dir: search.dir }) ?? 0)
      : -1
    setSearch({ ...search, pattern, matches, index })
    setFocus('viewer')
  }

  useKeyboard(ev => {
    if (ev.name === 'escape') {
      setSearch(null)
      setFocus('viewer')
    }
  })

  if (!search) return null
  const prompt = search.dir === 'forward' ? '/' : '?'

  return (
    <box flexDirection="row" height={1} paddingX={1}>
      <text fg={theme.foregroundMuted}>{prompt}</text>
      <box flexGrow={1}>
        <input
          focused
          // The prop's type also admits Textarea's SubmitEvent (not exported
          // by @opentui/core); at runtime the input's ENTER event always
          // emits its current string value.
          onSubmit={(value: unknown) => {
            if (typeof value === 'string') commit(value)
          }}
        />
      </box>
    </box>
  )
}
