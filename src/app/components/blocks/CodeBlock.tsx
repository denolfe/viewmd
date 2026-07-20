import { RGBA, infoStringToFiletype } from '@opentui/core'
import type { TextChunk } from '@opentui/core'
import { HighlightedText, RunScope, matchRangesForRun } from './InlineRenderer'
import { theme } from '../../styles/theme'
import { syntaxStyle } from '../../styles/syntax-style'
import { useAppState } from '../../state'
import { MERMAID_ASCII_LANG } from '../../lib/preprocess'
import type { Node } from '../../lib/ast'
import type { AppState } from '../../state'

const BORDER = 2 // left + right border cells
const PADDING_X = 2
const MARGIN_X = 2

export function CodeBlock({ node, id }: { node: Extract<Node, { kind: 'code' }>; id: string }) {
  const { contentWidth, search } = useAppState()

  // Rendered mermaid ASCII already carries its own frame; render it bare.
  // Unrendered mermaid source keeps lang 'mermaid' and falls through as a
  // normal framed code block below.
  if (node.lang === MERMAID_ASCII_LANG) {
    return (
      <box id={id} marginX={MARGIN_X}>
        <text wrapMode="none">
          <RunScope blockId={id} text={node.value}>
            <HighlightedText value={node.value} />
          </RunScope>
        </text>
      </box>
    )
  }

  const rawLang = node.lang && node.lang !== 'text' ? node.lang : undefined
  // Unrendered mermaid keeps its 'mermaid' title but skips tree-sitter (no
  // grammar for it) — render the raw source as plain highlighted text.
  const filetype = rawLang && rawLang !== 'mermaid' ? infoStringToFiletype(rawLang) : undefined
  const title = rawLang ? ` ${rawLang} ` : undefined

  const lines = node.value.split('\n')
  const maxLineWidth = lines.reduce((max, l) => Math.max(max, l.length), title?.length ?? 0)
  const frameWidth = maxLineWidth + 2 * PADDING_X + BORDER
  const maxFrameWidth = Math.max(1, contentWidth - 2 * MARGIN_X)

  return (
    <box
      id={id}
      border
      borderColor={theme.border}
      title={title}
      width={Math.min(frameWidth, maxFrameWidth)}
      marginX={MARGIN_X}
      paddingX={PADDING_X}
      paddingY={1}
    >
      {filetype ? (
        <code
          content={node.value}
          filetype={filetype}
          syntaxStyle={syntaxStyle}
          wrapMode="char"
          onChunks={makeMatchChunkTransform(search, id)}
        />
      ) : (
        <text wrapMode="char">
          <RunScope blockId={id} text={node.value}>
            <HighlightedText value={node.value} />
          </RunScope>
        </text>
      )}
    </box>
  )
}

const MATCH_BG = RGBA.fromHex(theme.searchMatchBg)
const MATCH_CURRENT_BG = RGBA.fromHex(theme.searchCurrentBg)
const MATCH_FG = RGBA.fromHex(theme.searchMatchFg)

/**
 * Syntax-highlighted blocks render through tree-sitter, so match spans can't
 * be injected as children; instead this post-processes the styled chunks,
 * splitting them at match boundaries and overriding bg/fg. The block's 'main'
 * run text IS `node.value`, and chunk text concatenates back to it, so the
 * projection-coordinate ranges align 1:1 with offsets in the chunk stream.
 */
function makeMatchChunkTransform(
  search: AppState['search'],
  blockElementId: string,
): ((chunks: TextChunk[]) => TextChunk[]) | undefined {
  const ranges = matchRangesForRun(search, blockElementId, 'main')
  if (!ranges.length) return undefined
  return chunks => {
    const text = chunks.map(c => c.text).join('')
    const out: TextChunk[] = []
    let offset = 0
    for (const chunk of chunks) {
      const chunkEnd = offset + chunk.text.length
      let pos = offset
      for (const r of ranges) {
        if (r.end <= offset || r.start >= chunkEnd) continue
        const start = Math.max(r.start, offset)
        const end = Math.min(r.end, chunkEnd)
        if (start > pos) out.push({ ...chunk, text: text.slice(pos, start) })
        out.push({
          ...chunk,
          text: text.slice(start, end),
          bg: r.isActive ? MATCH_CURRENT_BG : MATCH_BG,
          fg: MATCH_FG,
        })
        pos = end
      }
      if (pos < chunkEnd) out.push({ ...chunk, text: text.slice(pos, chunkEnd) })
      offset = chunkEnd
    }
    return out
  }
}
