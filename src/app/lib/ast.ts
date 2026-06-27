import { marked } from 'marked'
import type { Tokens } from 'marked'
import { htmlContainsBlockMarkdown, htmlToMarkdown, stripHtml } from './html'

marked.use({
  extensions: [
    {
      name: 'kbd',
      level: 'inline',
      start(src: string) {
        const i = src.search(/<kbd>/i)
        return i < 0 ? undefined : i
      },
      tokenizer(src: string) {
        const m = /^<kbd>([^<]*)<\/kbd>/i.exec(src)
        if (!m) return undefined
        return { type: 'kbd', raw: m[0], text: m[1] ?? '' }
      },
      renderer() {
        return ''
      },
    },
  ],
})

export type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; children: InlineNode[] }
  | { kind: 'em'; children: InlineNode[] }
  | { kind: 'del'; children: InlineNode[] }
  | { kind: 'codespan'; value: string }
  | { kind: 'link'; href: string; children: InlineNode[] }
  | { kind: 'image'; alt: string; src: string }
  | { kind: 'br' }
  | { kind: 'kbd'; value: string }

export type Node =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; id: string; text: InlineNode[] }
  | { kind: 'paragraph'; inline: InlineNode[] }
  | { kind: 'code'; lang?: string; value: string }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'blockquote'; children: Node[] }
  | { kind: 'table'; header: InlineNode[][]; rows: InlineNode[][][] }
  | { kind: 'hr' }
  | { kind: 'html'; value: string }
  | { kind: 'details'; summary: InlineNode[]; children: Node[] }
  | { kind: 'space' }

export type ListItem = {
  task: boolean
  checked: boolean
  children: Node[]
}

export type TocEntry = {
  id: string
  level: number
  text: string
  inline: InlineNode[]
  children: TocEntry[]
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

type ParseContext = {
  usedSlugs: Set<string>
  tocFlat: TocFlat
}

export function buildTree(markdown: string): {
  nodes: Node[]
  toc: TocEntry[]
  headingIds: string[]
} {
  const ctx: ParseContext = { usedSlugs: new Set(), tocFlat: [] }
  const tokens = marked.lexer(markdown)
  const nodes: Node[] = []

  for (const t of tokens) {
    const node = blockToNode(t, ctx)
    if (node) nodes.push(node)
  }

  const lifted = liftHtmlBlocks(wrapDetails(nodes), ctx)
  return { nodes: lifted, toc: nestToc(ctx.tocFlat), headingIds: collectHeadingIds(lifted) }
}

function collectHeadingIds(nodes: Node[]): string[] {
  const out: string[] = []
  const walk = (ns: Node[]) => {
    for (const n of ns) {
      if (n.kind === 'heading') out.push(n.id)
      else if (n.kind === 'blockquote' || n.kind === 'details') walk(n.children)
      else if (n.kind === 'list') for (const it of n.items) walk(it.children)
    }
  }
  walk(nodes)
  return out
}

type TocFlat = { id: string; level: number; text: string; inline: InlineNode[] }[]

// Replace html nodes containing headings/lists with real AST nodes by
// re-lexing the markdownified html. Synthesizes a trailing space because
// marked folds the html token's trailing blank line into its raw.
function liftHtmlBlocks(nodes: Node[], ctx: ParseContext): Node[] {
  const out: Node[] = []
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    if (n.kind === 'html' && htmlContainsBlockMarkdown(n.value)) {
      const sub = marked.lexer(htmlToMarkdown(n.value))
      for (const t of sub) {
        const node = blockToNode(t, ctx)
        if (node) out.push(node)
      }
      const next = nodes[i + 1]
      if (next && next.kind !== 'space') out.push({ kind: 'space' })
      continue
    }
    if (n.kind === 'details') {
      out.push({ ...n, children: liftHtmlBlocks(n.children, ctx) })
      continue
    }
    out.push(n)
  }
  return out
}

// Marked splits multi-block <details> across opener/body/closer html tokens.
// Roll them back into a single node so the body keeps full markdown rendering.
function wrapDetails(nodes: Node[]): Node[] {
  const out: Node[] = []
  let i = 0
  while (i < nodes.length) {
    const n = nodes[i]!
    if (n.kind === 'html' && /^\s*<details\b/i.test(n.value)) {
      const closer = findCloser(nodes, i + 1)
      if (closer !== -1) {
        const summary = extractSummary(n.value)
        const between = nodes.slice(i + 1, closer)
        out.push({ kind: 'details', summary, children: wrapDetails(between) })
        i = closer + 1
        continue
      }
    }
    out.push(n)
    i++
  }
  return out
}

function findCloser(nodes: Node[], start: number): number {
  let depth = 1
  for (let j = start; j < nodes.length; j++) {
    const n = nodes[j]!
    if (n.kind !== 'html') continue
    const opens = (n.value.match(/<details\b/gi) ?? []).length
    const closes = (n.value.match(/<\/details>/gi) ?? []).length
    depth += opens - closes
    if (depth <= 0) return j
  }
  return -1
}

function extractSummary(openerHtml: string): InlineNode[] {
  const m = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i.exec(openerHtml)
  if (!m) return []
  const sub = marked.lexer(m[1]!.trim())[0]
  if (sub && 'tokens' in sub && sub.tokens) {
    return (sub.tokens as Tokens.Generic[]).flatMap(inlineToNode)
  }
  return [{ kind: 'text', value: m[1]!.trim() }]
}

function blockToNode(t: Tokens.Generic, ctx: ParseContext): Node | null {
  switch (t.type) {
    case 'heading': {
      const h = t as Tokens.Heading
      const level = h.depth as 1 | 2 | 3 | 4 | 5 | 6
      const text = (h.tokens ?? []).flatMap(inlineToNode)
      const plain = h.text
      let id = slugify(plain) || 'section'
      const base = id
      let n = 2
      while (ctx.usedSlugs.has(id)) id = `${base}-${n++}`
      ctx.usedSlugs.add(id)
      ctx.tocFlat.push({ id, level, text: plain, inline: text })
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
      const items: ListItem[] = l.items.map(item => ({
        task: item.task === true,
        checked: item.checked === true,
        children: (item.tokens ?? [])
          .map(it => blockToNode(it as Tokens.Generic, ctx))
          .filter((n): n is Node => n !== null),
      }))
      return { kind: 'list', ordered: l.ordered, items }
    }
    case 'blockquote': {
      const b = t as Tokens.Blockquote
      const children = (b.tokens ?? [])
        .map(c => blockToNode(c as Tokens.Generic, ctx))
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
      return [{ kind: 'text', value: tx.text }]
    }
    case 'kbd': {
      const k = t as Tokens.Generic & { text: string }
      return [{ kind: 'kbd', value: k.text }]
    }
    case 'strong': {
      const s = t as Tokens.Strong
      return [{ kind: 'strong', children: (s.tokens ?? []).flatMap(inlineToNode) }]
    }
    case 'em': {
      const e = t as Tokens.Em
      return [{ kind: 'em', children: (e.tokens ?? []).flatMap(inlineToNode) }]
    }
    case 'del': {
      const d = t as Tokens.Del
      return [{ kind: 'del', children: (d.tokens ?? []).flatMap(inlineToNode) }]
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
      return [{ kind: 'image', alt: i.text, src: i.href }]
    }
    case 'br':
      return [{ kind: 'br' }]
    case 'html': {
      const raw = (t as { raw?: string }).raw ?? ''
      const stripped = stripHtml(raw)
      return stripped ? [{ kind: 'text', value: stripped }] : []
    }
    default: {
      const raw = (t as { raw?: string }).raw ?? ''
      return raw ? [{ kind: 'text', value: raw }] : []
    }
  }
}

function nestToc(flat: TocFlat): TocEntry[] {
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
