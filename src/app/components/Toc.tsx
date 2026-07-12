import { useAppState } from '../state'
import { flattenVisible, isTocExpanded } from '../lib/toc-util'
import { theme } from '../styles/theme'
import type { TocEntry } from '../lib/ast'
import { MutedInline } from './blocks/MutedInline'

export function Toc({ toc }: { toc: TocEntry[] }) {
  const { expanded, currentHeadingId, tocCursorId, focus } = useAppState()
  const visible = flattenVisible(toc, expanded)

  return (
    <scrollbox flexGrow={1} focusable={false} paddingX={1} paddingTop={1}>
      {visible.map(e => {
        const isExpanded = isTocExpanded(e, expanded)
        const hasChildren = e.children.length > 0
        const marker = hasChildren ? (isExpanded ? '▾' : '▸') : '•'
        const indent = '  '.repeat(Math.max(0, e.level - 1))
        const isCurrent = e.id === currentHeadingId
        const isCursor = focus === 'sidebar' && e.id === tocCursorId
        return (
          <box
            key={e.id}
            flexDirection="row"
            backgroundColor={isCursor ? theme.tocFocusBg : undefined}
          >
            <text fg={isCurrent ? theme.tocCurrent : theme.foregroundMuted}>
              {indent}
              {marker}{' '}
            </text>
            <box flexGrow={1}>
              <text fg={isCurrent ? theme.tocCurrent : theme.foregroundMuted}>
                {/* Current entry: bold emphasis on top of the tocCurrent color (bold is idempotent over nested <strong>). */}
                {isCurrent ? (
                  <strong>
                    <MutedInline nodes={e.inline} />
                  </strong>
                ) : (
                  <MutedInline nodes={e.inline} />
                )}
              </text>
            </box>
          </box>
        )
      })}
    </scrollbox>
  )
}
