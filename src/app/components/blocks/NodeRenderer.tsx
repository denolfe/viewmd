import { useTerminalDimensions } from '@opentui/react'
import { TextAttributes } from '@opentui/core'
import type { Node } from '../../lib/ast'
import { stripHtml } from '../../lib/html'
import { theme } from '../../styles/theme'
import { Heading } from './Heading'
import { Paragraph } from './Paragraph'
import { CodeBlock } from './CodeBlock'
import { List } from './List'
import { Blockquote } from './Blockquote'
import { Table } from './Table'
import { Details } from './Details'

export function NodeRenderer({ node }: { node: Node }) {
  switch (node.kind) {
    case 'heading':
      return <Heading node={node} />
    case 'paragraph':
      if (node.inline.length === 1 && node.inline[0]?.kind === 'image') {
        const img = node.inline[0]
        return <ImageBlock alt={img.alt} src={img.src} />
      }
      return <Paragraph node={node} />
    case 'code':
      return <CodeBlock node={node} />
    case 'list':
      return <List node={node} />
    case 'blockquote':
      return <Blockquote node={node} />
    case 'table':
      return <Table node={node} />
    case 'details':
      return <Details node={node} />
    case 'hr':
      return <Hr />
    case 'html': {
      const img = parseImgTag(node.value)
      if (img) return <ImageBlock alt={img.alt} src={img.src} />
      const text = stripHtml(node.value)
      if (!text) return null
      return (
        <box marginBottom={1} paddingX={2}>
          <text fg={theme.foregroundMuted}>{text}</text>
        </box>
      )
    }
    case 'space':
      return <box height={1} />
  }
}

function ImageBlock({ alt, src }: { alt: string; src: string }) {
  return (
    <box marginBottom={1} paddingX={2}>
      <text fg={theme.foregroundMuted}>
        <em>
          [Image: {alt || src}
          {alt && src ? (
            <>
              {' → '}
              <a href={src}>
                <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
                  {src}
                </span>
              </a>
            </>
          ) : null}
          ]
        </em>
      </text>
    </box>
  )
}

function parseImgTag(html: string): { alt: string; src: string } | null {
  const trimmed = html.trim()
  if (!/^<img\b[^>]*\/?>(\s*<\/img>)?$/i.test(trimmed)) return null
  const alt = /\balt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(trimmed)
  const src = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(trimmed)
  return {
    alt: alt ? (alt[2] ?? alt[3] ?? '') : '',
    src: src ? (src[2] ?? src[3] ?? '') : '',
  }
}

function Hr() {
  const { width } = useTerminalDimensions()
  return (
    <box height={1}>
      <text fg={theme.border}>{'─'.repeat(Math.max(0, width))}</text>
    </box>
  )
}

export function NodeList({ nodes }: { nodes: Node[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <NodeRenderer key={i} node={n} />
      ))}
    </>
  )
}
