import { RGBA, infoStringToFiletype } from '@opentui/core'
import type { TextChunk } from '@opentui/core'
import { HighlightedText, MatchScope, activeOccurrenceInBlock } from './InlineRenderer'
import { theme } from '../../styles/theme'
import { syntaxStyle } from '../../styles/syntax-style'
import { useAppState } from '../../state'
import { escapeRegex } from '../../lib/regex-util'
import type { Node } from '../../lib/ast'
import type { AppState } from '../../state'

const BORDER = 2 // left + right border cells
const PADDING_X = 2
const MARGIN_X = 2

export function CodeBlock({ node, id }: { node: Extract<Node, { kind: 'code' }>; id: string }) {
  const { contentWidth, search } = useAppState()

  // Mermaid ASCII already carries its own frame; render it bare.
  if (node.lang === 'mermaid') {
    return (
      <box id={id} marginX={MARGIN_X}>
        <text wrapMode="none">
          <MatchScope id={id}>
            <HighlightedText value={node.value} />
          </MatchScope>
        </text>
      </box>
    )
  }

  const rawLang = node.lang && node.lang !== 'text' ? node.lang : undefined
  const filetype = rawLang ? infoStringToFiletype(rawLang) : undefined
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
          <MatchScope id={id}>
            <HighlightedText value={node.value} />
          </MatchScope>
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
 * splitting them at match boundaries and overriding bg/fg. Chunk text
 * concatenates back to the block's source, so scanning it left-to-right keeps
 * occurrence ordinals aligned with findMatches' scan of `node.value`.
 */
function makeMatchChunkTransform(
  search: AppState['search'],
  blockElementId: string,
): ((chunks: TextChunk[]) => TextChunk[]) | undefined {
  if (!search?.pattern || !search.matches.some(m => m.blockElementId === blockElementId)) {
    return undefined
  }
  const pattern = search.pattern
  const activeOcc = activeOccurrenceInBlock(search, blockElementId)
  return chunks => {
    const text = chunks.map(c => c.text).join('')
    const re = new RegExp(escapeRegex(pattern), 'gi')
    const ranges: { start: number; end: number; isActive: boolean }[] = []
    let m: RegExpExecArray | null
    let occ = 0
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length, isActive: occ++ === activeOcc })
      if (re.lastIndex === m.index) re.lastIndex++ // safety for zero-length match
    }
    if (!ranges.length) return chunks

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
