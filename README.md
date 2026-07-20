# viewmd

An interactive terminal markdown viewer

<img src="preview.png" alt="Preview of viewmd rendering a markdown document with various features" width="600"/>

## Features

- **Mermaid diagrams** rendered as ASCII art, via [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid).
- **Syntax-highlighted code blocks** - tree-sitter highlighting in a bordered box labeled with the language.
- **Table-of-contents sidebar** - a collapsible tree of the document's headings.
- **Sticky headers** - as you scroll past a heading, its ancestors stay pinned at the top so you always know where you are.
- **Ergonomic navigation** - header navigation, page up/down, half-page up/down, and mouse scrolling.
- **Search** forward and backward, `less`-style.
- **Images** appear as a labeled, clickable link

## Install

```sh
npm install -g viewmd-cli
```

The package is `viewmd-cli`; the command it installs is `viewmd`.

## Usage

```sh
viewmd README.md     # open the interactive viewer (needs a TTY)
viewmd -r README.md  # print a one-shot ANSI render and exit
cat README.md | viewmd  # pipe input to the interactive viewer (needs a TTY)
cat README.md | viewmd -r  # pipe input to a one-shot render
```

## Configuration

`viewmd` reads an optional TOML config file, searched in this order:

1. `$VIEWMD_CONFIG` (explicit path)
2. `$XDG_CONFIG_HOME/viewmd/config.toml`
3. `~/.config/viewmd/config.toml`

```toml
# ~/.config/viewmd/config.toml

# Max content width (columns). Applies in interactive and render mode.
# Overrides the built-in cap of 100; minimum 20.
width = 100

# Default row cap for one-shot/render output (e.g. piping to a pager or fzf preview).
max-lines = 40
```

Precedence, highest first: **CLI flag > environment variable > config file > built-in default.**
Invalid keys or values are ignored with a warning on stderr; a malformed file never stops the viewer.

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

| Key           | Action                 |
| ------------- | ---------------------- |
| `j` / `k`     | Move down / up         |
| `t`           | Toggle expand/collapse |
| `Space`       | Expand / collapse      |
| `Enter`       | Jump to heading        |
| `Tab` / `Esc` | Back to the viewer     |
