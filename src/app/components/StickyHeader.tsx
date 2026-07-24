import { useAppState } from '../state'
import { ancestorChain, breadcrumbRows, documentHasH1 } from '../lib/toc-util'
import { theme } from '../styles/theme'
import { MutedInline } from './blocks/MutedInline'
import { onPrimaryClick } from '../lib/mouse'
import { documentTrail } from '../lib/trail'
import type { Crumb } from '../lib/trail'
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
  const { currentHeadingId, visibleHeadingIds, contentWidth, historyDepth, trailLabels, commands } =
    useAppState()

  const hasH1 = documentHasH1(toc)
  const chain = ancestorChain(toc, currentHeadingId)
  const rows = breadcrumbRows({ chain, visibleHeadingIds, hasH1, fileLabel })
  if (rows.length === 0 && historyDepth === 0) return null

  const trailRow =
    historyDepth > 0 ? (
      <box key="__trail" height={1} flexDirection="row" overflow="hidden">
        {documentTrail({ labels: trailLabels, maxWidth: Math.max(0, contentWidth - 3) }).flatMap(
          (crumb, i) => {
            const parts = []
            if (i > 0) {
              parts.push(
                <text key={`sep-${i}`} fg={theme.foregroundMuted}>
                  {' → '}
                </text>,
              )
            }
            parts.push(<TrailCrumb key={i} crumb={crumb} onBack={commands.goBack} />)
            return parts
          },
        )}
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
      {trailRow}
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

function TrailCrumb({ crumb, onBack }: { crumb: Crumb; onBack: () => void }) {
  if (crumb.kind === 'current') {
    return (
      <text fg={theme.heading}>
        <strong>{crumb.label}</strong>
      </text>
    )
  }
  if (crumb.kind === 'back') {
    return (
      <box overflow="hidden" onMouseDown={onPrimaryClick(onBack)}>
        <text fg={theme.foregroundMuted}>{crumb.label}</text>
      </box>
    )
  }
  return <text fg={theme.foregroundMuted}>{crumb.label}</text>
}
