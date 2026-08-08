# DOT Digraph Rendering Test

Exercise of the DOT subset `viewmd` renders. `replaceDotBlocks` translates each
`dot` / `graphviz` fence into a mermaid `flowchart` (`dotToMermaid`), then hands
it to `beautiful-mermaid` for the ASCII pass — the same renderer behind
`test/mermaid.md`.

DOT constructs with no flowchart equivalent (records, ports, HTML labels) are
rejected rather than approximated; those blocks degrade to their raw source —
see the last section.

## Fence Languages

### `dot`

```dot
digraph g {
  a -> b;
}
```

### `graphviz`

```graphviz
digraph g {
  a -> b;
}
```

## Direction (`rankdir`)

### Default (top-down)

```dot
digraph g {
  a -> b -> c;
}
```

### Left-right

```dot
digraph g {
  rankdir=LR;
  a -> b -> c;
}
```

### Bottom-top

```dot
digraph g {
  rankdir=BT;
  a -> b -> c;
}
```

### Right-left

```dot
digraph g {
  rankdir=RL;
  a -> b -> c;
}
```

### Set via a `graph` attribute statement

```dot
digraph g {
  graph [rankdir=LR];
  a -> b;
}
```

## Nodes

### Bare ids become their own label

```dot
digraph g {
  parse -> render;
}
```

### Explicit labels

```dot
digraph g {
  a [label="Read file"];
  b [label="Build AST"];
  a -> b;
}
```

### Quoted ids with spaces and punctuation

```dot
digraph g {
  "read file" -> "build-ast" -> "paint frame";
}
```

### Shapes

`beautiful-mermaid` paints every flowchart node as a rectangle, so shape is
carried through the translation but does not change the ASCII output.

```dot
digraph g {
  box [shape=box];
  round [shape=ellipse];
  circle [shape=circle];
  decision [shape=diamond];
  box -> round -> circle -> decision;
}
```

### Default shape via a `node` statement

```dot
digraph g {
  node [shape=box];
  a -> b;
}
```

## Edges

### Chains expand to one edge per hop

```dot
digraph g {
  a -> b -> c -> d;
}
```

### Edge labels

```dot
digraph g {
  parse -> ast [label="tokens"];
  ast -> render [label="nodes"];
}
```

### Fan-out and fan-in

```dot
digraph g {
  ast -> render;
  ast -> toc;
  render -> viewer;
  toc -> viewer;
}
```

### Undirected graphs

`graph` with `--` edges translates to arrows; the flowchart renderer has no
undirected edge.

```dot
graph g {
  a -- b -- c;
}
```

### `strict` prefix

```dot
strict digraph g {
  a -> b;
  a -> b;
}
```

## Subgraphs

### `cluster*` subgraphs draw a box

```dot
digraph g {
  rankdir=LR;
  subgraph cluster_input {
    label="input";
    a;
    b;
  }
  a -> c;
  b -> c;
}
```

### Plain subgraphs only scope, matching Graphviz

```dot
digraph g {
  subgraph plain {
    a;
  }
  a -> b;
}
```

## Comments

```dot
digraph g {
  // line comment
  # hash comment
  /* block
     comment */
  a -> b;
}
```

## A Realistic Pipeline

```dot
digraph viewmd {
  rankdir=TB;
  node [shape=box];

  file [label="markdown"];
  file -> preprocess [label="raw"];
  preprocess -> ast [label="fences swapped"];
  ast -> toc;
  ast -> viewer;
  toc -> viewer [label="jump"];
}
```

## Graceful Degradation (unsupported constructs)

`dotToMermaid` throws `UnsupportedDotError` for these, and `replaceDotBlocks`
leaves the fence untouched so it renders as a framed code block.

### Record shapes

```dot
digraph g {
  x [shape=record, label="<f0>left|<f1>right"];
  x -> y;
}
```

### Record ports

```dot
digraph g {
  a:f0 -> b:f1;
}
```

### HTML labels

```dot
digraph g {
  a [label=<<b>bold</b>>];
  a -> b;
}
```

### Empty graph

```dot
digraph g {
}
```

### Malformed source

```dot
digraph g {
  a -> b;
```
