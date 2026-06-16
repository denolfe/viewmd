import { marked } from 'marked'
import type { Tokens } from 'marked'

export type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; children: InlineNode[] }
  | { kind: 'em'; children: InlineNode[] }
  | { kind: 'codespan'; value: string }
  | { kind: 'link'; href: string; children: InlineNode[] }
  | { kind: 'image'; alt: string }
  | { kind: 'br' }
  | { kind: 'kbd'; value: string }

export type Node =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; id: string; text: InlineNode[] }
  | { kind: 'paragraph'; inline: InlineNode[] }
  | { kind: 'code'; lang?: string; value: string }
  | { kind: 'list'; ordered: boolean; items: Node[][] }
  | { kind: 'blockquote'; children: Node[] }
  | { kind: 'table'; header: InlineNode[][]; rows: InlineNode[][][] }
  | { kind: 'hr' }
  | { kind: 'html'; value: string }
  | { kind: 'space' }

export type TocEntry = { id: string; level: number; text: string; children: TocEntry[] }

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function buildTree(markdown: string): { nodes: Node[]; toc: TocEntry[] } {
  const tokens = marked.lexer(markdown)
  const usedSlugs = new Set<string>()
  const nodes: Node[] = []
  const tocFlat: { id: string; level: number; text: string }[] = []

  for (const t of tokens) {
    const node = blockToNode(t, usedSlugs, tocFlat)
    if (node) nodes.push(node)
  }

  return { nodes, toc: nestToc(tocFlat) }
}

function blockToNode(
  t: Tokens.Generic,
  usedSlugs: Set<string>,
  tocFlat: { id: string; level: number; text: string }[],
): Node | null {
  switch (t.type) {
    case 'heading': {
      const h = t as Tokens.Heading
      const level = h.depth as 1 | 2 | 3 | 4 | 5 | 6
      const text = (h.tokens ?? []).flatMap(inlineToNode)
      const plain = h.text
      let id = slugify(plain) || 'section'
      const base = id
      let n = 2
      while (usedSlugs.has(id)) id = `${base}-${n++}`
      usedSlugs.add(id)
      tocFlat.push({ id, level, text: plain })
      return { kind: 'heading', level, id, text }
    }
    case 'paragraph': {
      const p = t as Tokens.Paragraph
      return { kind: 'paragraph', inline: (p.tokens ?? []).flatMap(inlineToNode) }
    }
    case 'code': {
      const c = t as Tokens.Code
      return { kind: 'code', lang: c.lang || undefined, value: c.text }
    }
    case 'list': {
      const l = t as Tokens.List
      const items = l.items.map(item =>
        (item.tokens ?? [])
          .map(it => blockToNode(it as Tokens.Generic, usedSlugs, tocFlat))
          .filter((n): n is Node => n !== null),
      )
      return { kind: 'list', ordered: l.ordered, items }
    }
    case 'blockquote': {
      const b = t as Tokens.Blockquote
      const children = (b.tokens ?? [])
        .map(c => blockToNode(c as Tokens.Generic, usedSlugs, tocFlat))
        .filter((n): n is Node => n !== null)
      return { kind: 'blockquote', children }
    }
    case 'table': {
      const tab = t as Tokens.Table
      const header = tab.header.map(c => (c.tokens ?? []).flatMap(inlineToNode))
      const rows = tab.rows.map(r => r.map(c => (c.tokens ?? []).flatMap(inlineToNode)))
      return { kind: 'table', header, rows }
    }
    case 'hr':
      return { kind: 'hr' }
    case 'html': {
      const h = t as Tokens.HTML
      return { kind: 'html', value: h.text }
    }
    case 'space':
      return { kind: 'space' }
    case 'text': {
      // Top-level text wrapped as paragraph
      const tt = t as Tokens.Text & { tokens?: Tokens.Generic[] }
      const inline = tt.tokens
        ? tt.tokens.flatMap(inlineToNode)
        : [{ kind: 'text' as const, value: tt.text }]
      return { kind: 'paragraph', inline }
    }
    default:
      return null
  }
}

function inlineToNode(t: Tokens.Generic): InlineNode[] {
  switch (t.type) {
    case 'text': {
      const tx = t as Tokens.Text
      // If text contains nested tokens (e.g. inside strong), recurse
      if ('tokens' in tx && tx.tokens) return tx.tokens.flatMap(inlineToNode)
      return parseKbd(tx.text)
    }
    case 'strong': {
      const s = t as Tokens.Strong
      return [{ kind: 'strong', children: (s.tokens ?? []).flatMap(inlineToNode) }]
    }
    case 'em': {
      const e = t as Tokens.Em
      return [{ kind: 'em', children: (e.tokens ?? []).flatMap(inlineToNode) }]
    }
    case 'codespan': {
      const c = t as Tokens.Codespan
      return [{ kind: 'codespan', value: c.text }]
    }
    case 'link': {
      const l = t as Tokens.Link
      return [{ kind: 'link', href: l.href, children: (l.tokens ?? []).flatMap(inlineToNode) }]
    }
    case 'image': {
      const i = t as Tokens.Image
      return [{ kind: 'image', alt: i.text }]
    }
    case 'br':
      return [{ kind: 'br' }]
    default: {
      const raw = (t as { raw?: string }).raw ?? ''
      return raw ? [{ kind: 'text', value: raw }] : []
    }
  }
}

function parseKbd(text: string): InlineNode[] {
  const KBD = /\x02KBD\x02(.*?)\x02\/KBD\x02/g
  const out: InlineNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = KBD.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) })
    out.push({ kind: 'kbd', value: m[1] ?? '' })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
  return out
}

function nestToc(flat: { id: string; level: number; text: string }[]): TocEntry[] {
  const root: TocEntry[] = []
  const stack: TocEntry[] = []
  for (const h of flat) {
    const entry: TocEntry = { ...h, children: [] }
    while (stack.length && stack[stack.length - 1]!.level >= h.level) stack.pop()
    if (stack.length === 0) root.push(entry)
    else stack[stack.length - 1]!.children.push(entry)
    stack.push(entry)
  }
  return root
}
