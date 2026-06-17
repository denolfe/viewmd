import { useAppState } from './state'
import { findAncestors } from './toc-util'
import { theme } from './theme'
import type { TocEntry } from './ast'

export function StickyHeader({ toc, title }: { toc: TocEntry[]; title: string }) {
  const { currentHeadingId } = useAppState()
  if (toc.length === 0) return null
  const chain = currentHeadingId ? findAncestors(toc, currentHeadingId) : []
  const crumbs = [title, ...chain.map(c => c.text)].join('  ›  ')
  return (
    <box flexDirection="column" flexShrink={0}>
      <box height={1} paddingX={1} overflow="hidden">
        <text fg={theme.foregroundMuted}>{crumbs}</text>
      </box>
    </box>
  )
}
