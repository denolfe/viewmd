import { renderMermaidAscii } from 'beautiful-mermaid'
import { dotToMermaid } from './dot-to-mermaid'

/**
 * Fence lang marking a pre-rendered mermaid ASCII block. It carries its own
 * frame, so `CodeBlock` renders it bare. Diagrams the renderer can't handle keep
 * the original `mermaid` lang and fall through to the normal framed code block.
 */
export const MERMAID_ASCII_LANG = 'mermaidascii'

const MERMAID_BLOCK_REGEX = /```mermaid\s*\n([\s\S]*?)```/g
const DOT_BLOCK_REGEX = /```(?:dot|graphviz)\s*\n([\s\S]*?)```/g

export function replaceMermaidBlocks(markdown: string): string {
  return markdown.replace(
    MERMAID_BLOCK_REGEX,
    (raw, diagram: string) => renderBlock(diagram) ?? raw,
  )
}

/** DOT reaches the ASCII renderer by translation; untranslatable DOT stays a code block. */
export function replaceDotBlocks(markdown: string): string {
  return markdown.replace(DOT_BLOCK_REGEX, (raw, diagram: string) => {
    try {
      return renderBlock(dotToMermaid(diagram)) ?? raw
    } catch {
      return raw
    }
  })
}

function renderBlock(diagram: string): string | undefined {
  try {
    const ascii = renderMermaidAscii(diagram.trim())
      .split('\n')
      .map(l => l.trimEnd())
      .join('\n')
    return '```' + MERMAID_ASCII_LANG + '\n' + ascii + '\n```'
  } catch {
    return undefined
  }
}
