import { renderMermaidAscii } from 'beautiful-mermaid'

const MERMAID_BLOCK_REGEX = /```mermaid\s*\n([\s\S]*?)```/g

export function replaceMermaidBlocks(markdown: string): string {
  return markdown.replace(MERMAID_BLOCK_REGEX, (raw, diagram: string) => {
    try {
      const ascii = renderMermaidAscii(diagram.trim())
        .split('\n')
        .map(l => l.trimEnd())
        .join('\n')
      return '```mermaid\n' + ascii + '\n```'
    } catch {
      return raw
    }
  })
}
