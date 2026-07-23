import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import { useAppState } from '../state'
import { findMatches } from '../lib/search'
import { ancestorChain, breadcrumbRows, documentHasH1 } from '../lib/toc-util'
import { theme } from '../styles/theme'
import type { Node, TocEntry } from '../lib/ast'

// Fixed overlay width: a constant input width sidesteps the buffer-scroll bug
// where fast typing outruns React resizing an input sized to its pattern.
const BAR_WIDTH = 28

export function SearchBar({
  nodes,
  toc,
  fileLabel,
}: {
  nodes: Node[]
  toc: TocEntry[]
  fileLabel?: string
}) {
  const {
    search,
    setSearch,
    setFocus,
    viewerRef,
    focus,
    currentHeadingId,
    visibleHeadingIds,
    contentWidth,
  } = useAppState()

  // Recompute from the input's current string: Enter arriving before React
  // re-renders must not commit a stale (truncated/empty) pattern.
  const applyPattern = (pattern: string, committed: boolean) => {
    if (!search) return
    const matches = findMatches(nodes, pattern)
    const index = matches.length
      ? (viewerRef.current?.seedMatchIndex({ matches, dir: search.dir }) ?? 0)
      : -1
    setSearch({ ...search, pattern, matches, index, committed })
  }

  const commit = (pattern: string) => {
    applyPattern(pattern, true)
    setFocus('viewer')
  }

  const onInput = (pattern: string) => {
    applyPattern(pattern, false)
  }

  useKeyboard(ev => {
    if (focus !== 'search') return // committed-mode keys go through mapKey/dispatch
    if (ev.name === 'escape') {
      setSearch(null)
      setFocus('viewer')
    }
  })

  if (!search) return null

  const isTyping = focus === 'search'
  const hasPattern = search.pattern.length > 0
  const isMiss = hasPattern && search.matches.length === 0
  // Blend into whatever surface sits under the top row: the breadcrumb when it
  // has rows, the plain viewer background otherwise. Miss keeps the red tint.
  const breadcrumbShowing =
    breadcrumbRows({
      chain: ancestorChain(toc, currentHeadingId),
      visibleHeadingIds,
      hasH1: documentHasH1(toc),
      fileLabel,
    }).length > 0
  const surfaceBg = breadcrumbShowing ? theme.stickyBg : theme.background
  const bg = isMiss ? theme.searchBarNoMatchBg : surfaceBg
  const label = search.dir === 'forward' ? '/' : '?'
  const counter = hasPattern
    ? `${search.matches.length ? search.index + 1 : 0} of ${search.matches.length}`
    : ''
  // Muted counter reads fine on the dark surfaces; on the red miss bar it
  // would be illegible, so fall back to the regular bar fg there.
  const counterFg = isMiss ? theme.searchBarFg : theme.foregroundMuted
  // Right-align the bar with the breadcrumb's right edge (contentWidth + 1),
  // leaving the scrollbar column uncovered.
  const barWidth = Math.min(BAR_WIDTH, contentWidth + 1)
  const barLeft = Math.max(0, contentWidth + 1 - barWidth)
  // Counter right-aligned inside the bar; hidden when the pattern would run
  // under it (paddingX + label + pattern + cursor cell + one gap cell).
  const counterLeft = barWidth - 1 - counter.length
  const showCounter =
    counter.length > 0 && 1 + label.length + search.pattern.length + 2 < counterLeft

  return (
    <box
      position="absolute"
      top={0}
      left={barLeft}
      width={barWidth}
      height={1}
      zIndex={20}
      flexDirection="row"
      paddingX={1}
      backgroundColor={bg}
      overflow="hidden"
    >
      <text fg={theme.searchBarFg} attributes={TextAttributes.BOLD}>
        {label}
      </text>
      {isTyping ? (
        <box flexGrow={1}>
          <input
            focused
            backgroundColor={bg}
            focusedBackgroundColor={bg}
            textColor={theme.searchBarFg}
            focusedTextColor={theme.searchBarFg}
            onInput={onInput}
            // The prop's type also admits Textarea's SubmitEvent (not exported
            // by @opentui/core); at runtime the input's ENTER event always
            // emits its current string value.
            onSubmit={(value: unknown) => {
              if (typeof value === 'string') commit(value)
            }}
          />
        </box>
      ) : (
        <text fg={theme.searchBarFg}>{search.pattern}</text>
      )}
      {showCounter && (
        <text position="absolute" left={counterLeft} fg={counterFg}>
          {counter}
        </text>
      )}
    </box>
  )
}
