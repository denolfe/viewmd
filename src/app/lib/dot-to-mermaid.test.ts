import { describe, expect, test } from 'bun:test'
import { renderMermaidAscii } from 'beautiful-mermaid'
import { UnsupportedDotError, dotToMermaid } from './dot-to-mermaid'

describe('dotToMermaid', () => {
  test('translates nodes, edges, and edge labels', () => {
    const out = dotToMermaid('digraph g { a -> b [label="go"]; }')
    expect(out).toBe('flowchart TD\n  a[a]\n  b[b]\n  a -->|go| b')
  })

  test('an edge chain expands to one edge per hop', () => {
    const out = dotToMermaid('digraph g { a -> b -> c; }')
    expect(out).toContain('a --> b')
    expect(out).toContain('b --> c')
  })

  test('rankdir maps onto flowchart direction', () => {
    expect(dotToMermaid('digraph g { rankdir=LR; a -> b; }')).toStartWith('flowchart LR')
    expect(dotToMermaid('digraph g { graph [rankdir=BT]; a -> b; }')).toStartWith('flowchart BT')
  })

  test('quoted labels override the node id', () => {
    expect(dotToMermaid('digraph g { a [label="Parse it"]; a -> b; }')).toContain('a[Parse it]')
  })

  test('shapes map onto flowchart node wrappers', () => {
    expect(dotToMermaid('digraph g { a [shape=diamond]; a -> b; }')).toContain('a{a}')
    expect(dotToMermaid('digraph g { node [shape=circle]; a -> b; }')).toContain('a((a))')
  })

  test('cluster subgraphs become mermaid subgraphs; plain ones only scope', () => {
    const clustered = dotToMermaid('digraph g { subgraph cluster_x { label="X"; a; } a -> b; }')
    expect(clustered).toContain('subgraph sg0[X]')
    expect(clustered).toContain('end')

    expect(dotToMermaid('digraph g { subgraph plain { a; } a -> b; }')).not.toContain('subgraph')
  })

  test('ids that are not bare words are rewritten and kept unique', () => {
    const out = dotToMermaid('digraph g { "a b" -> "a-b"; }')
    expect(out).toContain('a_b[a b]')
    expect(out).toContain('a_b_2[a-b]')
    expect(out).toContain('a_b --> a_b_2')
  })

  test('only the wrapper it sits in is stripped from a label', () => {
    // `]` would end the node early and swallow the rest of the graph; `|` and `(` are harmless.
    expect(dotToMermaid('digraph g { a [label="x|y(z)]w"]; a -> b; }')).toContain('a[x|y(z) w]')
    expect(dotToMermaid('digraph g { a [label="p}q", shape=diamond]; a -> b; }')).toContain(
      'a{p q}',
    )
  })

  test('an edge label only drops the pipe that would close it early', () => {
    expect(dotToMermaid('digraph g { a -> b [label="x|y (z)"]; }')).toContain('a -->|x y (z)| b')
  })

  test('comments and `strict` are tolerated', () => {
    const out = dotToMermaid('strict digraph g {\n  // note\n  /* block */\n  a -> b;\n}')
    expect(out).toContain('a --> b')
  })

  test('undirected graphs translate as directed edges', () => {
    expect(dotToMermaid('graph g { a -- b; }')).toContain('a --> b')
  })

  test.each([
    ['not DOT at all', 'flowchart TD\n a --> b'],
    ['record shapes', 'digraph g { a [shape=record, label="<f0>x"]; }'],
    ['record ports', 'digraph g { a:f0 -> b; }'],
    ['HTML labels', 'digraph g { a [label=<<b>x</b>>]; }'],
    ['an empty graph', 'digraph g { }'],
    ['an unterminated body', 'digraph g { a -> b;'],
  ])('rejects %s', (_name, dot) => {
    expect(() => dotToMermaid(dot)).toThrow(UnsupportedDotError)
  })
})

/**
 * A DOT graph and its hand-written mermaid twin must paint the same ASCII, so
 * `dot` fences are not a second-class diagram. Sources mirror `test/mermaid.md`.
 */
describe('dot renders identically to equivalent mermaid', () => {
  const render = (src: string) =>
    renderMermaidAscii(src)
      .split('\n')
      .map(l => l.trimEnd())
      .join('\n')
      .trim()

  test.each([
    [
      'decision flow',
      'graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Process]\n  B -->|No| D[End]\n  C --> D',
      'digraph g {\n  A [label="Start"]; B [label="Decision", shape=diamond];\n  C [label="Process"]; D [label="End"];\n  A -> B; B -> C [label="Yes"]; B -> D [label="No"]; C -> D;\n}',
    ],
    ['chain LR', 'graph LR\n  A --> B --> C --> D', 'digraph g { rankdir=LR; A -> B -> C -> D; }'],
    ['chain BT', 'graph BT\n  A --> B --> C', 'digraph g { rankdir=BT; A -> B -> C; }'],
    ['chain RL', 'graph RL\n  A --> B --> C', 'digraph g { rankdir=RL; A -> B -> C; }'],
    [
      'fan-out and fan-in',
      'graph TD\n  ast --> render\n  ast --> toc\n  render --> viewer\n  toc --> viewer',
      'digraph g { ast -> render; ast -> toc; render -> viewer; toc -> viewer; }',
    ],
    [
      'edge labels',
      'graph LR\n  A -->|go| B\n  B -->|go| C',
      'digraph g { rankdir=LR; A -> B -> C [label="go"]; }',
    ],
    [
      'subgraphs',
      'graph TD\n  subgraph frontend\n    a1[UI] --> a2[Router]\n  end\n  subgraph backend\n    b1[API] --> b2[DB]\n  end\n  a2 --> b1',
      'digraph g {\n  subgraph cluster_f { label="frontend"; a1 [label="UI"]; a2 [label="Router"]; a1 -> a2; }\n  subgraph cluster_b { label="backend"; b1 [label="API"]; b2 [label="DB"]; b1 -> b2; }\n  a2 -> b1;\n}',
    ],
  ])('%s', (_name, mermaid, dot) => {
    expect(render(dotToMermaid(dot))).toBe(render(mermaid))
  })
})
