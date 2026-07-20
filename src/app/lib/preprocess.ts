import { renderMermaidAscii } from 'beautiful-mermaid'

/**
 * Fence lang marking a pre-rendered mermaid ASCII block. It carries its own
 * frame, so `CodeBlock` renders it bare. Diagrams the renderer can't handle keep
 * the original `mermaid` lang and fall through to the normal framed code block.
 */
export const MERMAID_ASCII_LANG = 'mermaidascii'

const MERMAID_BLOCK_REGEX = /```mermaid\s*\n([\s\S]*?)```/g

export function replaceMermaidBlocks(markdown: string): string {
  return markdown.replace(MERMAID_BLOCK_REGEX, (raw, diagram: string) => {
    try {
      const ascii = renderMermaidAscii(diagram.trim())
        .split('\n')
        .map(l => l.trimEnd())
        .join('\n')
      return '```' + MERMAID_ASCII_LANG + '\n' + ascii + '\n```'
    } catch {
      return raw
    }
  })
}
