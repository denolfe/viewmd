import { useAppState } from '../state'
import { ancestorChain, breadcrumbRows, documentHasH1 } from '../lib/toc-util'
import { theme } from '../styles/theme'
import { MutedInline } from './blocks/MutedInline'
import { onPrimaryClick } from '../lib/mouse'
import type { TocEntry } from '../lib/ast'

export function StickyHeader({
  toc,
  fileLabel,
  onCrumbClick,
}: {
  toc: TocEntry[]
  fileLabel?: string
  onCrumbClick: (id: string) => void
}) {
  const { currentHeadingId, visibleHeadingIds, contentWidth, historyDepth, backLabel, goBack } =
    useAppState()

  const hasH1 = documentHasH1(toc)
  const chain = ancestorChain(toc, currentHeadingId)
  const rows = breadcrumbRows({ chain, visibleHeadingIds, hasH1, fileLabel })
  if (rows.length === 0 && historyDepth === 0) return null

  const backBadge =
    historyDepth > 0 ? (
      <box key="__back" height={1} overflow="hidden" onMouseDown={onPrimaryClick(goBack)}>
        <text>
          <strong>{'‹'.repeat(historyDepth)} Back</strong>
          {backLabel ? <span fg={theme.foregroundMuted}>{` to ${backLabel}`}</span> : ''}
        </text>
      </box>
    ) : null

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
      {backBadge}
      {rows.map(row =>
        row.variant === 'pill' ? (
          <box
            key={row.id}
            height={1}
            overflow="hidden"
            onMouseDown={onPrimaryClick(() => onCrumbClick(row.id))}
          >
            <text bg={theme.h1Bg} fg={theme.h1Fg}>
              <strong>
                {` `}
                <MutedInline nodes={row.inline} />
                {` `}
              </strong>
            </text>
          </box>
        ) : (
          <box
            key={row.id}
            height={1}
            overflow="hidden"
            onMouseDown={onPrimaryClick(() => onCrumbClick(row.id))}
          >
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
