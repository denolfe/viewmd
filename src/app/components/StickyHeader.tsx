import { useAppState } from '../state'
import { buildBreadcrumbs, maxTocDepth } from '../lib/toc-util'
import { theme } from '../styles/theme'
import { MutedInline } from './blocks/MutedInline'
import type { InlineNode, TocEntry } from '../lib/ast'

export function StickyHeader({ toc, fileLabel }: { toc: TocEntry[]; fileLabel?: string }) {
  const { currentHeadingId } = useAppState()
  if (toc.length === 0) return null

  const hasH1 = toc[0]?.level === 1
  const synthRoot: { inline: InlineNode[] } | null =
    !hasH1 && fileLabel ? { inline: [{ kind: 'text', value: fileLabel }] } : null

  const chain = buildBreadcrumbs(toc, currentHeadingId)
  const offset = synthRoot ? 1 : 0
  const rows = maxTocDepth(toc) + offset

  return (
    <box flexDirection="column" flexShrink={0} paddingX={1}>
      {Array.from({ length: rows }, (_, i) => {
        let crumb: { inline: InlineNode[]; indent: number } | null = null
        if (synthRoot && i === 0) crumb = { inline: synthRoot.inline, indent: 0 }
        else {
          const c = chain[i - offset]
          if (c) crumb = { inline: c.inline, indent: i * 2 }
        }
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
