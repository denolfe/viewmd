import { useAppState } from '../state'
import { findCurrent } from '../lib/toc-util'
import { theme } from '../styles/theme'
import { MutedInline } from './blocks/MutedInline'
import type { InlineNode, TocEntry } from '../lib/ast'

export function StickyHeader({ toc, fileLabel }: { toc: TocEntry[]; fileLabel?: string }) {
  const { currentHeadingId, visibleHeadingIds } = useAppState()

  const h1 = toc[0]?.level === 1 ? toc[0] : null
  const topInline: InlineNode[] | null = h1
    ? h1.inline
    : fileLabel
      ? [{ kind: 'text', value: fileLabel }]
      : null
  const topId = h1?.id ?? null
  const topHidden = topId ? visibleHeadingIds.has(topId) : false

  const current = findCurrent(toc, currentHeadingId)
  // Suppress row 2 when it would duplicate row 1 (current heading is the H1).
  // The `current.id === topId` clause is defensive insurance for the frame
  // between a heading-jump dispatch and the next visibleHeadingIds refresh —
  // without it, row 2 briefly duplicates row 1 after a TOC select onto H1.
  const currentHidden = current ? visibleHeadingIds.has(current.id) || current.id === topId : false

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      height={2}
      overflow="hidden"
      paddingX={2}
      backgroundColor={theme.stickyBg}
      position="relative"
      zIndex={10}
    >
      <box height={1} overflow="hidden">
        <text fg={theme.headingMuted} bg={theme.stickyBg}>
          {topInline && !topHidden ? <MutedInline nodes={topInline} /> : ' '}
        </text>
      </box>
      <box height={1} overflow="hidden">
        <text fg={theme.headingMuted} bg={theme.stickyBg}>
          {current && !currentHidden ? (
            <>
              {'#'.repeat(current.level) + ' '}
              <MutedInline nodes={current.inline} />
            </>
          ) : (
            ' '
          )}
        </text>
      </box>
    </box>
  )
}
