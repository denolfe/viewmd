import { renderMermaidAscii } from 'beautiful-mermaid'

export const KBD_PREFIX = '\x02KBD\x02'
export const KBD_SUFFIX = '\x02/KBD\x02'

const MERMAID_BLOCK_REGEX = /```mermaid\s*\n([\s\S]*?)```/g
const KBD_REGEX = /<kbd>([^<]*)<\/kbd>/gi

export function replaceMermaidBlocks(markdown: string): string {
  return markdown.replace(MERMAID_BLOCK_REGEX, (raw, diagram: string) => {
    try {
      const ascii = renderMermaidAscii(diagram.trim())
        .split('\n')
        .map(l => l.trimEnd())
        .join('\n')
      return '```text\n' + ascii + '\n```'
    } catch {
      return raw
    }
  })
}

export function replaceKbdTags(markdown: string): string {
  return markdown.replace(KBD_REGEX, (_, content: string) => `${KBD_PREFIX}${content}${KBD_SUFFIX}`)
}
