import { renderMermaidAscii } from 'beautiful-mermaid'
import type { Tokens } from 'marked'
import { dotToMermaid } from './dot-to-mermaid'

/**
 * Fence lang marking a pre-rendered mermaid ASCII block. It carries its own
 * frame, so `CodeBlock` renders it bare. Diagrams the renderer can't handle keep
 * the original `mermaid` lang and fall through to the normal framed code block.
 */
export const MERMAID_ASCII_LANG = 'mermaidascii'

/**
 * Rewrites mermaid / DOT fences into rendered ASCII in place and returns the
 * same token list. Only `lang` and `text` change; `raw` keeps the source
 * fence so line-number passes over the same tokens still match the file.
 * Working on tokens rather than the markdown text means fences nested in
 * lists, blockquotes, or a wider code fence are handled by the lexer's own
 * nesting rules instead of a regex.
 */
export function renderDiagramBlocks(tokens: Tokens.Generic[]): Tokens.Generic[] {
  for (const t of tokens) {
    if (t.type === 'code') {
      renderDiagramCode(t as Tokens.Code)
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

function renderDiagramCode(code: Tokens.Code): void {
  const lang = fenceLang(code)
  let ascii: string | undefined
  if (lang === 'mermaid') {
    ascii = renderAscii(code.text)
  } else if (lang === 'dot' || lang === 'graphviz') {
    // DOT reaches the ASCII renderer by translation; untranslatable DOT stays a code block.
    try {
      ascii = renderAscii(dotToMermaid(code.text))
    } catch {
      ascii = undefined
    }
  }
  if (ascii === undefined) return
  code.lang = MERMAID_ASCII_LANG
  code.text = ascii
}

/** First word of the info string, so `mermaid title=x` still counts as mermaid. */
function fenceLang(code: Tokens.Code): string {
  return (code.lang ?? '').trim().split(/\s+/)[0] ?? ''
}

function renderAscii(diagram: string): string | undefined {
  try {
    return renderMermaidAscii(diagram.trim())
      .split('\n')
      .map(l => l.trimEnd())
      .join('\n')
  } catch {
    return undefined
  }
}
