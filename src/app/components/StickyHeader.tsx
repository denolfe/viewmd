import { useAppState } from '../state'
import { ancestorChain, breadcrumbRows } from '../lib/toc-util'
import { theme } from '../styles/theme'
import { MutedInline } from './blocks/MutedInline'
import type { TocEntry } from '../lib/ast'

export function StickyHeader({ toc, fileLabel }: { toc: TocEntry[]; fileLabel?: string }) {
  const { currentHeadingId, visibleHeadingIds, contentWidth } = useAppState()

  const hasH1 = toc[0]?.level === 1
  const chain = ancestorChain(toc, currentHeadingId)
  const rows = breadcrumbRows({ chain, visibleHeadingIds, hasH1, fileLabel })
  if (rows.length === 0) return null

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      // Span the viewer's paddingRight gutter too so the background reaches the
      // scrollbar (Viewer width is contentWidth + scrollbar(1) + paddingRight(1)).
      width={contentWidth + 1}
      flexDirection="column"
      backgroundColor={theme.stickyBg}
      paddingX={2}
      zIndex={10}
    >
      {rows.map(row =>
        row.variant === 'pill' ? (
          <box key={row.id} height={1} overflow="hidden">
            <text bg={theme.h1Bg} fg={theme.h1Fg}>
              <strong>
                {` `}
                <MutedInline nodes={row.inline} />
                {` `}
              </strong>
            </text>
          </box>
        ) : (
          <box key={row.id} height={1} overflow="hidden">
            <text fg={theme.heading} bg={theme.stickyBg}>
              <strong>
                {'#'.repeat(row.level) + ' '}
                <MutedInline nodes={row.inline} />
              </strong>
            </text>
          </box>
        ),
      )}
    </box>
  )
}
