import { useState } from 'react'
import { useKeyboard } from '@opentui/react'
import { useAppState } from '../state'
import { findMatches } from '../lib/search'
import { theme } from '../styles/theme'
import type { Node } from '../lib/ast'

export function SearchInput({ nodes }: { nodes: Node[] }) {
  const { search, setSearch, setFocus, viewerRef } = useAppState()
  const [value, setValue] = useState('')

  const commit = () => {
    if (!search) return
    const matches = findMatches(nodes, value)
    // Seed at the first visible match (view stays put), else the nearest match
    // in the search direction — not blindly at the document's first match.
    const index = matches.length
      ? (viewerRef.current?.seedMatchIndex({ matches, pattern: value, dir: search.dir }) ?? 0)
      : -1
    setSearch({ ...search, pattern: value, matches, index })
    setFocus('viewer')
  }

  useKeyboard(ev => {
    if (ev.name === 'return') commit()
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
        <input focused value={value} onInput={setValue} />
      </box>
    </box>
  )
}
