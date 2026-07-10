# viewmd

Terminal markdown renderer with mermaid diagram support.

- Mermaid diagrams → ASCII art
- Inline images (iTerm2, Kitty, Sixel, ANSI fallback)
- Syntax-highlighted code blocks with box borders
- Less-style pager with search and sticky headers

<img src="preview.png" alt="Preview of viewmd rendering a markdown document with various features" width="600"/>

## Installation

_Prerequisites: Bun_

```sh
git clone git@github.com:denolfe/viewmd.git
cd viewmd
bun install
bun link
```

## Usage

```sh
# Interactive viewer (requires a TTY)
viewmd README.md
```

## Pipe / fzf preview

When stdout is not a TTY (a pipe, a redirect, an fzf preview pane), `viewmd` skips the interactive viewer and prints a one-shot ANSI render instead. Force this in a TTY with `--render` / `-r`.

```sh
# Pipe to a pager
viewmd README.md | less -R

# From stdin
cat README.md | viewmd

# fzf preview
fzf --ansi --preview 'viewmd {}'
```

## Features

### Mermaid Diagrams

Converts mermaid code blocks to ASCII art using [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid).

### Inline Images

Renders images directly in the terminal using [terminal-image](https://github.com/sindresorhus/terminal-image). Uses native terminal protocols (iTerm2, Kitty, Sixel) when available, falls back to ANSI block characters.

### Sticky Headers

When scrolled past a heading, ancestor headers appear dimmed at the top of the viewport, showing your position in the document hierarchy. For example, when reading content under an H3, the parent H2 and H1 are displayed above with a separator line.

<img src="sticky-headers.png" alt="Screenshot showing sticky headers in viewmd, with H1 and H2 displayed at the top of the viewport while reading an H3 section" width="600"/>

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

## Releasing

1. Bump `version` in `package.json`.
2. `git commit -am "chore(release): vX.Y.Z" && git tag vX.Y.Z && git push --follow-tags`
3. CI builds all platforms, stages, and publishes `viewmd` + `viewmd-*` to npm, and creates a GitHub Release.

Requires the `NPM_TOKEN` repository secret (npm automation token).
