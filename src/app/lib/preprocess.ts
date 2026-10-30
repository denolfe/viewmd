import { renderMermaidAscii } from 'beautiful-mermaid'
import type { Tokens } from 'marked'
import { dotToMermaid } from './dot-to-mermaid'

/**
 * Fence lang marking a pre-rendered mermaid ASCII block. It carries its own
 * frame, so `CodeBlock` renders it bare. Diagrams the renderer can't handle keep
 * the original `mermaid` lang and fall through to the normal framed code block.
 */
export const MERMAID_ASCII_LANG = 'mermaidascii'

/** A code token after diagram rendering; `diagramSource` is the mermaid it was rendered from. */
export type DiagramCode = Tokens.Code & { diagramSource?: string }

/** Spacing knobs of the ASCII renderer (cells between nodes, blank rows inside boxes). */
export type DiagramSpacing = { paddingX: number; boxBorderPadding: number }

/**
 * Rewrites mermaid / DOT fences into rendered ASCII in place and returns the
 * same token list. Only `lang`, `text`, and `diagramSource` change; `raw` keeps
 * the source fence so line-number passes over the same tokens still match the file.
 * Working on tokens rather than the markdown text means fences nested in
 * lists, blockquotes, or a wider code fence are handled by the lexer's own
 * nesting rules instead of a regex.
 */
export function renderDiagramBlocks(tokens: Tokens.Generic[]): Tokens.Generic[] {
  for (const t of tokens) {
    if (t.type === 'code') {
      renderDiagramCode(t as DiagramCode)
    } else if (t.type === 'blockquote') {
      renderDiagramBlocks(((t as Tokens.Blockquote).tokens ?? []) as Tokens.Generic[])
    } else if (t.type === 'list') {
      for (const item of (t as Tokens.List).items) {
        renderDiagramBlocks((item.tokens ?? []) as Tokens.Generic[])
      }
    }
  }
  return tokens
}

/** Renders mermaid to ASCII with trailing spaces trimmed; undefined when the renderer rejects it. */
export function renderAscii(diagram: string, spacing?: DiagramSpacing): string | undefined {
  try {
    return renderMermaidAscii(diagram.trim(), spacing)
      .split('\n')
      .map(l => l.trimEnd())
      .join('\n')
  } catch {
    return undefined
  }
}

function renderDiagramCode(code: DiagramCode): void {
  const source = mermaidSource(code)
  if (source === undefined) return
  const ascii = renderAscii(source)
  if (ascii === undefined) return
  code.lang = MERMAID_ASCII_LANG
  code.text = ascii
  code.diagramSource = source
}

function mermaidSource(code: Tokens.Code): string | undefined {
  const lang = fenceLang(code)
  if (lang === 'mermaid') return code.text
  if (lang !== 'dot' && lang !== 'graphviz') return undefined
  // DOT reaches the ASCII renderer by translation; untranslatable DOT stays a code block.
  try {
    return dotToMermaid(code.text)
  } catch {
    return undefined
  }
}

/** First word of the info string, so `mermaid title=x` still counts as mermaid. */
function fenceLang(code: Tokens.Code): string {
  return (code.lang ?? '').trim().split(/\s+/)[0] ?? ''
}
