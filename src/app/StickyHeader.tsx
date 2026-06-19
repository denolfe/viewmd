import { useAppState } from './state'
import { buildBreadcrumbs, maxTocDepth } from './toc-util'
import { theme } from './theme'
import { MutedInline } from './components/MutedInline'
import type { TocEntry } from './ast'

export function StickyHeader({ toc }: { toc: TocEntry[] }) {
  const { currentHeadingId } = useAppState()
  if (toc.length === 0) return null
  const crumbs = buildBreadcrumbs(toc, currentHeadingId)
  const rows = maxTocDepth(toc)
  return (
    <box flexDirection="column" flexShrink={0} paddingX={1}>
      {Array.from({ length: rows }, (_, i) => {
        const crumb = crumbs[i]
        return (
          <box key={i} height={1} overflow="hidden">
            <text fg={theme.foregroundMuted}>
              {crumb ? (
                <>
                  {' '.repeat(crumb.indent)}
                  {crumb.indent > 0 ? '› ' : ''}
                  <MutedInline nodes={crumb.inline} />
                </>
              ) : (
                ' '
              )}
            </text>
          </box>
        )
      })}
    </box>
  )
}
