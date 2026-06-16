import { useAppState } from './state'
import { theme } from './theme'

export function StatusLine() {
  const { search } = useAppState()
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
