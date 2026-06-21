import { useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { buildBreadcrumbs, maxTocDepth } from '../lib/toc-util'
import { theme } from '../styles/theme'
import { MutedInline } from './blocks/MutedInline'
import type { InlineNode, TocEntry } from '../lib/ast'

export function StickyHeader({ toc, fileLabel }: { toc: TocEntry[]; fileLabel?: string }) {
  const { currentHeadingId, visibleHeadingIds } = useAppState()
  if (toc.length === 0) return null

  const hasH1 = toc[0]?.level === 1
  const synthRoot: { inline: InlineNode[] } | null =
    !hasH1 && fileLabel ? { inline: [{ kind: 'text', value: fileLabel }] } : null

  const { width: termWidth } = useTerminalDimensions()
  const chain = buildBreadcrumbs(toc, currentHeadingId)
  const offset = synthRoot ? 1 : 0
  const rows = maxTocDepth(toc) + offset

  return (
    <box flexDirection="column" flexShrink={0} paddingX={1} backgroundColor={theme.stickyBg}>
      {Array.from({ length: rows }, (_, i) => {
        let crumb: { inline: InlineNode[]; indent: number } | null = null
        let hidden = false
        if (synthRoot && i === 0) {
          crumb = { inline: synthRoot.inline, indent: 0 }
        } else {
          const c = chain[i - offset]
          if (c) {
            crumb = { inline: c.inline, indent: i * 2 }
            if (visibleHeadingIds.has(c.id)) hidden = true
          }
        }
        return (
          <box key={i} height={1} overflow="hidden">
            <text fg={theme.foregroundMuted} bg={theme.stickyBg}>
              {crumb && !hidden ? (
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
      <box key="rule" height={1} overflow="hidden">
        <text fg={theme.stickyRule} bg={theme.stickyBg}>
          {'─'.repeat(Math.max(0, termWidth - 2))}
        </text>
      </box>
    </box>
  )
}
