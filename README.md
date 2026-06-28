# sanemd

Terminal markdown renderer with mermaid diagram support.

- Mermaid diagrams → ASCII art
- Inline images (iTerm2, Kitty, Sixel, ANSI fallback)
- Syntax-highlighted code blocks with box borders
- Less-style pager with search and sticky headers

<img src="preview.png" alt="Preview of sanemd rendering a markdown document with various features" width="600"/>

## Installation

_Prerequisites: Bun_

```sh
git clone git@github.com:denolfe/sanemd.git
cd sanemd
bun install
bun link
```

## Usage

```sh
# Interactive viewer (requires a TTY)
sanemd README.md
```

## Pipe / fzf preview

When stdout is not a TTY (a pipe, a redirect, an fzf preview pane), `sanemd` skips the interactive viewer and prints a one-shot ANSI render instead. Force this in a TTY with `--render` / `-r`.

```sh
# Pipe to a pager
sanemd README.md | less -R

# From stdin
cat README.md | sanemd

# fzf preview
fzf --ansi --preview 'sanemd {}'
```

## Features

### Mermaid Diagrams

Converts mermaid code blocks to ASCII art using [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid).

### Inline Images

Renders images directly in the terminal using [terminal-image](https://github.com/sindresorhus/terminal-image). Uses native terminal protocols (iTerm2, Kitty, Sixel) when available, falls back to ANSI block characters.

### Sticky Headers

When scrolled past a heading, ancestor headers appear dimmed at the top of the viewport, showing your position in the document hierarchy. For example, when reading content under an H3, the parent H2 and H1 are displayed above with a separator line.

<img src="sticky-headers.png" alt="Screenshot showing sticky headers in sanemd, with H1 and H2 displayed at the top of the viewport while reading an H3 section" width="600"/>

### Keyboard Shortcuts

| Key           | Action                                  |
| ------------- | --------------------------------------- |
| `n`           | Next header                             |
| `N`           | Previous header                         |
| `j` / `↓`     | Scroll down one line                    |
| `k` / `↑`     | Scroll up one line                      |
| `Space` / `f` | Page down                               |
| `b`           | Page up                                 |
| `d`           | Half page down                          |
| `u`           | Half page up                            |
| `g`           | Go to top                               |
| `G`           | Go to bottom                            |
| `/`           | Search forward                          |
| `?`           | Search backward                         |
| `m`           | Toggle mouse scroll (off = select text) |
| `=`           | Show position info                      |
| `q`           | Quit                                    |
