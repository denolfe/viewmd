import { useAppState } from '../state'
import { theme } from '../styles/theme'
import { SearchInput } from './SearchInput'
import type { Node } from '../lib/ast'

export function StatusLine({ nodes }: { nodes: Node[] }) {
  const { search, focus } = useAppState()
  if (focus === 'search') return <SearchInput nodes={nodes} />
  let content = ':'
  if (search) {
    const total = search.matches.length
    content = total
      ? `${search.dir === 'forward' ? '/' : '?'}${search.pattern}  match ${search.index + 1}/${total}`
      : `${search.pattern}  no matches`
  }
  return (
    <box height={1} paddingX={1}>
      <text fg={theme.foregroundMuted}>{content}</text>
    </box>
  )
}
