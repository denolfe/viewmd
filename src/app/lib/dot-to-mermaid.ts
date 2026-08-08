/**
 * Translates the DOT subset that maps cleanly onto a Mermaid `flowchart` so
 * `dot` fences can reuse the existing Mermaid ASCII renderer. Records, ports,
 * and HTML labels have no flowchart equivalent and are rejected, not degraded.
 */

type NodeAttrs = {
  label: string
  shape?: string
}

type Edge = {
  from: string
  to: string
  label?: string
}

type Cluster = {
  label?: string
  nodeIds: string[]
}

export class UnsupportedDotError extends Error {}

const DIRECTIONS: Record<string, string> = { TB: 'TD', TD: 'TD', BT: 'BT', LR: 'LR', RL: 'RL' }

/**
 * @throws {UnsupportedDotError} when the source is not DOT, or uses a construct
 * with no flowchart equivalent.
 */
export function dotToMermaid(dot: string): string {
  const tokens = tokenize(dot)
  const graph = parseGraph(tokens)
  return emitMermaid(graph)
}

// ---------------------------------------------------------------------------
// Lexer

type Token = { kind: 'id' | 'punct'; value: string; quoted: boolean }

const PUNCT = new Set(['{', '}', '[', ']', ';', ',', '=', ':'])

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]

    if (ch === undefined) break
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '#' || src.startsWith('//', i)) {
      const nl = src.indexOf('\n', i)
      i = nl === -1 ? src.length : nl
      continue
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? src.length : end + 2
      continue
    }
    if (src.startsWith('->', i) || src.startsWith('--', i)) {
      tokens.push({ kind: 'punct', value: '->', quoted: false })
      i += 2
      continue
    }
    if (ch === '"') {
      const { value, next } = readQuoted(src, i)
      tokens.push({ kind: 'id', value, quoted: true })
      i = next
      continue
    }
    if (ch === '<') throw new UnsupportedDotError('HTML labels are not supported')
    if (PUNCT.has(ch)) {
      tokens.push({ kind: 'punct', value: ch, quoted: false })
      i++
      continue
    }

    const match = /^[A-Za-z0-9_.\-+]+/.exec(src.slice(i))
    if (!match) throw new UnsupportedDotError(`unexpected character ${JSON.stringify(ch)}`)
    tokens.push({ kind: 'id', value: match[0], quoted: false })
    i += match[0].length
  }
  return tokens
}

function readQuoted(src: string, start: number): { value: string; next: number } {
  let out = ''
  let i = start + 1
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') {
      const escaped = src[i + 1]
      // \l \r \n are DOT line breaks; the ASCII renderer is single-line per node.
      out += escaped === 'l' || escaped === 'r' || escaped === 'n' ? ' ' : (escaped ?? '')
      i += 2
      continue
    }
    if (ch === '"') return { value: out, next: i + 1 }
    out += ch
    i++
  }
  throw new UnsupportedDotError('unterminated quoted string')
}

// ---------------------------------------------------------------------------
// Parser

type Graph = {
  direction: string
  nodes: Map<string, NodeAttrs>
  edges: Edge[]
  clusters: Cluster[]
}

type Scope = { shape?: string }

function parseGraph(tokens: Token[]): Graph {
  let pos = 0

  const peek = (offset = 0): Token | undefined => tokens[pos + offset]
  const next = (): Token | undefined => tokens[pos++]

  const graph: Graph = { direction: 'TD', nodes: new Map(), edges: [], clusters: [] }

  if (peek()?.value === 'strict') pos++
  const kind = next()
  if (kind?.value !== 'digraph' && kind?.value !== 'graph') {
    throw new UnsupportedDotError('not a DOT graph')
  }
  if (peek()?.kind === 'id') pos++ // optional graph name
  if (next()?.value !== '{') throw new UnsupportedDotError('expected `{`')

  parseStatements({})
  return graph

  /** Consumes statements up to the matching `}`, recursing into subgraphs. */
  function parseStatements(scope: Scope, cluster?: Cluster): void {
    while (pos < tokens.length) {
      const token = peek()
      if (!token) break
      if (token.value === '}') {
        pos++
        return
      }
      if (token.value === ';' || token.value === ',') {
        pos++
        continue
      }
      parseStatement(scope, cluster)
    }
    throw new UnsupportedDotError('unterminated graph body')
  }

  function parseStatement(scope: Scope, cluster?: Cluster): void {
    const token = peek()
    if (!token) return

    if (!token.quoted && token.value === 'subgraph') {
      pos++
      const name = peek()?.kind === 'id' ? next()?.value : undefined
      if (next()?.value !== '{') throw new UnsupportedDotError('expected `{` after subgraph')
      // Only `cluster*` subgraphs draw a box in Graphviz; others are scope-only.
      const isCluster = name?.startsWith('cluster') ?? false
      const child: Cluster | undefined = isCluster ? { nodeIds: [] } : cluster
      parseStatements({ ...scope }, child)
      if (isCluster && child) graph.clusters.push(child)
      return
    }

    if (
      !token.quoted &&
      (token.value === 'node' || token.value === 'edge' || token.value === 'graph')
    ) {
      pos++
      const attrs = parseAttrList()
      if (token.value === 'node' && attrs.shape) scope.shape = attrs.shape
      if (token.value === 'graph') applyGraphAttrs(attrs, cluster)
      return
    }

    // `rankdir = LR` / `label = "…"` at statement level.
    if (peek(1)?.value === '=') {
      const key = next()?.value ?? ''
      pos++
      const value = next()?.value ?? ''
      applyGraphAttrs({ [key]: value }, cluster)
      return
    }

    parseNodeOrEdge(scope, cluster)
  }

  function parseNodeOrEdge(scope: Scope, cluster?: Cluster): void {
    const chain: string[] = [readNodeId()]
    while (peek()?.value === '->') {
      pos++
      chain.push(readNodeId())
    }
    const attrs = peek()?.value === '[' ? parseAttrList() : {}

    for (const id of chain) {
      declareNode({ id, attrs: chain.length === 1 ? attrs : {}, scope, cluster })
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i]
      const to = chain[i + 1]
      if (from === undefined || to === undefined) continue
      graph.edges.push({ from, to, label: attrs.label })
    }
  }

  function readNodeId(): string {
    const token = next()
    if (!token || token.kind !== 'id') throw new UnsupportedDotError('expected a node id')
    if (peek()?.value === ':') throw new UnsupportedDotError('record ports are not supported')
    return token.value
  }

  function parseAttrList(): Record<string, string> {
    const attrs: Record<string, string> = {}
    while (peek()?.value === '[') {
      pos++
      while (peek() && peek()?.value !== ']') {
        const token = next()
        if (!token) break
        if (token.value === ',' || token.value === ';') continue
        if (peek()?.value === '=') {
          pos++
          const value = next()
          if (value) attrs[token.value] = value.value
        }
      }
      pos++ // closing ]
    }
    return attrs
  }

  function applyGraphAttrs(attrs: Record<string, string>, cluster?: Cluster): void {
    const rankdir = attrs.rankdir?.toUpperCase()
    const direction = rankdir ? DIRECTIONS[rankdir] : undefined
    if (direction) graph.direction = direction
    if (cluster && attrs.label !== undefined) cluster.label = attrs.label
  }

  function declareNode(params: {
    id: string
    attrs: Record<string, string>
    scope: Scope
    cluster?: Cluster
  }): void {
    const { id, attrs, scope, cluster } = params
    const shape = attrs.shape ?? scope.shape
    if (shape === 'record' || shape === 'Mrecord') {
      throw new UnsupportedDotError('record shapes are not supported')
    }
    const existing = graph.nodes.get(id)
    graph.nodes.set(id, {
      label: attrs.label ?? existing?.label ?? id,
      shape: shape ?? existing?.shape,
    })
    if (cluster && !cluster.nodeIds.includes(id)) cluster.nodeIds.push(id)
  }
}

// ---------------------------------------------------------------------------
// Emitter

const SHAPE_WRAPPERS: Record<string, [string, string]> = {
  box: ['[', ']'],
  rect: ['[', ']'],
  rectangle: ['[', ']'],
  square: ['[', ']'],
  circle: ['((', '))'],
  doublecircle: ['((', '))'],
  ellipse: ['(', ')'],
  oval: ['(', ')'],
  diamond: ['{', '}'],
  cylinder: ['[(', ')]'],
}

function emitMermaid(graph: Graph): string {
  if (graph.nodes.size === 0) throw new UnsupportedDotError('graph has no nodes')

  const ids = safeIds([...graph.nodes.keys()])
  const lines = [`flowchart ${graph.direction}`]
  const clustered = new Set(graph.clusters.flatMap(c => c.nodeIds))

  for (const [id, attrs] of graph.nodes) {
    if (clustered.has(id)) continue
    lines.push(`  ${declaration({ id: ids.get(id) ?? id, attrs })}`)
  }

  graph.clusters.forEach((cluster, index) => {
    const title = escapeLabel(cluster.label ?? '', ']')
    lines.push(`  subgraph sg${index}${title ? `[${title}]` : ''}`)
    for (const id of cluster.nodeIds) {
      const attrs = graph.nodes.get(id)
      if (attrs) lines.push(`    ${declaration({ id: ids.get(id) ?? id, attrs })}`)
    }
    lines.push('  end')
  })

  for (const edge of graph.edges) {
    const from = ids.get(edge.from) ?? edge.from
    const to = ids.get(edge.to) ?? edge.to
    const label = edge.label ? `|${escapeLabel(edge.label, '|')}|` : ''
    lines.push(`  ${from} -->${label} ${to}`)
  }

  return lines.join('\n')
}

function declaration(params: { id: string; attrs: NodeAttrs }): string {
  const { id, attrs } = params
  const [open, close] = SHAPE_WRAPPERS[attrs.shape ?? ''] ?? ['[', ']']
  return `${id}${open}${escapeLabel(attrs.label, close)}${close}`
}

/** Mermaid ids are bare words; DOT ids are not, so map them and keep them unique. */
function safeIds(dotIds: string[]): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<string>()
  for (const id of dotIds) {
    let safe = id.replace(/[^A-Za-z0-9_]/g, '_')
    if (safe === '' || /^[0-9]/.test(safe)) safe = `n_${safe}`
    let candidate = safe
    let n = 2
    while (taken.has(candidate)) candidate = `${safe}_${n++}`
    taken.add(candidate)
    out.set(id, candidate)
  }
  return out
}

/**
 * Labels are emitted unquoted, because the ASCII renderer prints quotes
 * literally. Only the characters that close the surrounding wrapper have to go
 * — one of them silently truncates the rest of the graph, not just the label.
 */
function escapeLabel(label: string, closers: string): string {
  const forbidden = new Set(closers)
  return [...label]
    .map(ch => (forbidden.has(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
