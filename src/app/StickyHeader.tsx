import { useAppState } from './state'
import { buildBreadcrumbs } from './toc-util'
import { theme } from './theme'
import { MutedInline } from './components/MutedInline'
import type { TocEntry } from './ast'

export function StickyHeader({ toc, title }: { toc: TocEntry[]; title: string }) {
  const { currentHeadingId } = useAppState()
  if (toc.length === 0) return null
  const crumbs = buildBreadcrumbs(toc, title, currentHeadingId)
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      paddingX={1}
      border={['bottom']}
      borderStyle="single"
      borderColor={theme.border}
    >
      {crumbs.map((crumb, i) => (
        <box key={i} height={1} overflow="hidden">
          <text fg={theme.foregroundMuted}>
            {' '.repeat(crumb.indent)}
            {crumb.indent > 0 ? '› ' : ''}
            <MutedInline nodes={crumb.inline} />
          </text>
        </box>
      ))}
    </box>
  )
}
