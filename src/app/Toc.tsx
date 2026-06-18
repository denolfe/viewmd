import { useAppState } from './state'
import { flattenVisible } from './toc-util'
import { theme } from './theme'
import type { TocEntry, InlineNode } from './ast'
import { Pill } from './components/InlineRenderer'

export function Toc({ toc }: { toc: TocEntry[] }) {
  const { expanded, currentHeadingId, tocCursorId, focus } = useAppState()
  const visible = flattenVisible(toc, expanded)

  return (
    <scrollbox flexGrow={1} focused={false} paddingX={1} paddingTop={1}>
      {visible.map(e => {
        const isExpanded = expanded.get(e.id) ?? e.level <= 2
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
              {/* Current entry: bold emphasis on top of the tocCurrent color (bold is idempotent over nested <strong>). */}
              {isCurrent ? (
                <strong>
                  <TocInline nodes={e.inline} />
                </strong>
              ) : (
                <TocInline nodes={e.inline} />
              )}
            </text>
          </box>
        )
      })}
    </scrollbox>
  )
}

function TocInline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'text':
            return <span key={i}>{n.value}</span>
          case 'strong':
            return (
              <strong key={i}>
                <TocInline nodes={n.children} />
              </strong>
            )
          case 'em':
            return (
              <em key={i}>
                <TocInline nodes={n.children} />
              </em>
            )
          case 'codespan':
            return (
              <Pill key={i} bg={theme.codespanBg} fg={theme.codespanFg}>
                {n.value}
              </Pill>
            )
          case 'kbd':
            return (
              <Pill key={i} bg={theme.kbdBg}>
                {n.value}
              </Pill>
            )
          case 'link':
            return <TocInline key={i} nodes={n.children} />
          case 'image':
            return <span key={i}>{n.alt || n.src}</span>
          case 'br':
            return <span key={i}> </span>
        }
      })}
    </>
  )
}
