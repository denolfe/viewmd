# Mermaid Rendering Test

Exhaustive exercise of every mermaid diagram type and syntax feature that
`beautiful-mermaid` (the renderer behind `viewmd`) supports. Each block is
pre-rendered to ASCII by `replaceMermaidBlocks` before the AST is built.

ASCII-rendered types: flowchart, state, sequence, class, ER.
Unsupported types (including xychart, which the lib only renders as SVG, not
ASCII) degrade gracefully to their raw source — see the last section.

## Flowcharts

### Direction: Top-Down (`graph TD`)

```mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[End]
  C --> D
```

### Direction: Left-Right (`graph LR`)

```mermaid
graph LR
  A --> B --> C --> D
```

### Direction: Bottom-Top (`graph BT`)

```mermaid
graph BT
  A --> B --> C
```

### Direction: Right-Left (`graph RL`)

```mermaid
graph RL
  A --> B --> C
```

### `flowchart` keyword alias

```mermaid
flowchart TD
  A --> B
```

### Node shapes

```mermaid
graph TD
  A[Rectangle] --> B(Rounded)
  B --> C{Diamond}
  C --> D((Circle))
  D --> E>Asymmetric]
```

### Edge styles and labels

```mermaid
graph LR
  A -->|solid| B
  A -.->|dotted| C
  A ==>|thick| D
  A -- plain text --> E
```

### Subgraphs

```mermaid
graph TD
  subgraph frontend
    a1[UI] --> a2[Router]
  end
  subgraph backend
    b1[API] --> b2[DB]
  end
  a2 --> b1
```

### Inline `linkStyle`

```mermaid
graph LR
  A --> B
  B --> C
  linkStyle 0 stroke:#f00,stroke-width:2px
```

## State Diagrams

### Basic transitions

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Running: start
  Running --> Idle: stop
  Running --> [*]
```

### Composite state

```mermaid
stateDiagram-v2
  [*] --> Active
  state Active {
    [*] --> Loading
    Loading --> Ready
  }
  Active --> [*]
```

### Fork

```mermaid
stateDiagram-v2
  state fork <<fork>>
  [*] --> fork
  fork --> A
  fork --> B
```

### Notes

```mermaid
stateDiagram-v2
  [*] --> A
  note right of A: side note
```

## Sequence Diagrams

### Basic messages (sync / async)

```mermaid
sequenceDiagram
  Alice->>Bob: Hello Bob!
  Bob-->>Alice: Hi Alice!
```

### Participants and activation

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server
  C->>S: request
  activate S
  S-->>C: response
  deactivate S
```

### Loops

```mermaid
sequenceDiagram
  Alice->>Bob: ping
  loop every minute
    Bob-->>Alice: pong
  end
```

### Alt / else

```mermaid
sequenceDiagram
  A->>B: request
  alt success
    B-->>A: 200 OK
  else failure
    B-->>A: 500 Error
  end
```

### Optional block

```mermaid
sequenceDiagram
  A->>B: request
  opt cache miss
    B-->>A: fetched
  end
```

### Parallel block

```mermaid
sequenceDiagram
  par notify B
    A->>B: event
  and notify C
    A->>C: event
  end
```

### Notes

```mermaid
sequenceDiagram
  A->>B: hi
  Note right of B: processing
```

## Class Diagrams

### Attributes and methods

```mermaid
classDiagram
  class Animal {
    +String name
    +int age
    +move()
    +eat()
  }
```

### Relationship types

```mermaid
classDiagram
  Animal <|-- Dog
  Car *-- Engine
  House o-- Room
  Client ..> Service
  Order --> Customer
```

### Generics

```mermaid
classDiagram
  class List~T~ {
    +add(T item)
    +get(int i) T
  }
```

## ER Diagrams

### Cardinality variants

```mermaid
erDiagram
  A ||--|| B : one-to-one
  A ||--o{ C : one-to-zero-many
  A ||--|{ D : one-to-many
  A }o--o{ E : many-to-many
```

### Entity attributes

```mermaid
erDiagram
  CUSTOMER {
    string name
    int id
  }
  ORDER {
    int number
    date created
  }
  CUSTOMER ||--o{ ORDER : places
```

## Graceful Degradation (unsupported types)

These types have no ASCII renderer in `beautiful-mermaid` 0.1.3; the renderer
throws and `replaceMermaidBlocks` falls back to showing the raw source
unchanged. (xychart renders as SVG only, so it lands here too.)

### XY Chart (SVG-only)

```mermaid
xychart-beta
  title "Monthly Revenue"
  x-axis [Jan, Feb, Mar, Apr, May, Jun]
  y-axis "Revenue ($K)" 0 --> 500
  bar [180, 250, 310, 280, 350, 420]
```

### Gantt

```mermaid
gantt
  title Roadmap
  section Phase 1
  Design :a1, 2026-01-01, 30d
  Build  :a2, after a1, 45d
```

### Pie

```mermaid
pie title Pets
  "Dogs" : 40
  "Cats" : 60
```
