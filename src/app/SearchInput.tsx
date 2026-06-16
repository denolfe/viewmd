import { useState } from 'react'
import { useKeyboard } from '@opentui/react'
import { useAppState } from './state'
import { findMatches } from './search'
import { theme } from './theme'
import type { Node } from './ast'

export function SearchInput({ nodes }: { nodes: Node[] }) {
  const { search, setSearch, setFocus } = useAppState()
  const [value, setValue] = useState('')

  const commit = () => {
    if (!search) return
    const matches = findMatches(nodes, value)
    setSearch({ ...search, pattern: value, matches, index: matches.length ? 0 : -1 })
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
      <input focused value={value} onChange={setValue} />
    </box>
  )
}
