# viewmd

An interactive terminal markdown viewer

> Pre-1.0 beta. Until the first stable release, install the beta explicitly: `npm install -g viewmd@beta`.

## Install

```sh
npm install -g viewmd@beta
```

## Usage

```sh
viewmd README.md     # open the interactive viewer (needs a TTY)
viewmd -r README.md  # print a one-shot ANSI render and exit
```

```sh
viewmd README.md
```

## Features

- **Mermaid diagrams** rendered as ASCII art, via [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid).
- **Syntax-highlighted code blocks** - tree-sitter highlighting in a bordered box labeled with the language.
- **Table-of-contents sidebar** - a collapsible tree of the document's headings.
- **Sticky headers** - as you scroll past a heading, its ancestors stay pinned at the top so you always know where you are.
- **Ergonomic navigation** - header navigation, page up/down, half-page up/down, and mouse scrolling.
- **Search** forward and backward, `less`-style.
- **Images** appear as a labeled, clickable link

## Keyboard shortcuts

### Viewer

| Key              | Action                                    |
| ---------------- | ----------------------------------------- |
| `j` / `↓`        | Down one line                             |
| `k` / `↑`        | Up one line                               |
| `Space` / `PgDn` | Page down                                 |
| `b` / `PgUp`     | Page up                                   |
| `d` / `u`        | Half page down / up                       |
| `g` / `G`        | Top / bottom                              |
| `n` / `N`        | Next / previous heading (or search match) |
| `/` / `?`        | Search forward / backward                 |
| `Esc`            | Clear search                              |
| `Tab`            | Focus the table-of-contents sidebar       |
| `m`              | Toggle mouse scroll (off = select text)   |
| `q` / `Ctrl-C`   | Quit                                      |

### Sidebar

| Key           | Action             |
| ------------- | ------------------ |
| `j` / `k`     | Move down / up     |
| `Space`       | Expand / collapse  |
| `Enter`       | Jump to heading    |
| `Tab` / `Esc` | Back to the viewer |
