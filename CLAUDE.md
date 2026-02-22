# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                        # Run tests (uses bun:test, not vitest)
bun test --watch                # Watch mode
bun test src/lib/ansi.test.ts   # Single test file
bun run typecheck               # Type check

./src/sanemd.ts README.md       # Run CLI directly
cat README.md | ./src/sanemd.ts # Stdin mode
```

## Architecture

Terminal markdown renderer built on `marked` + `marked-terminal`. Converts markdown to styled terminal output with mermaid diagrams, inline images, and a less-like pager.

### Pipeline

1. **Input** (`src/sanemd.ts`) - Read from file or stdin
2. **Mermaid** (`src/lib/renderers.ts`) - Convert mermaid blocks to ASCII art via `beautiful-mermaid`
3. **Images** (`src/lib/images.ts`) - Replace image syntax with placeholders, load image data
4. **Parse** - `marked` with customized `marked-terminal` renderers
5. **Output** - Direct write or pager mode based on content length

### Key Modules

- **`src/lib/renderers.ts`** - Renderer extensions that wrap `marked-terminal` functions. Pattern: `getRenderer()` to get original, wrap it, assign back to `ext.renderer[key]`.
- **`src/lib/images.ts`** - Image loading (local/remote), Kitty protocol for direct image output, ANSI block fallback via `terminal-image`.
- **`src/lib/pager.ts`** - Less-style pager with search (`/`, `?`), header navigation (`n`, `N`), sticky headers, mouse scroll.

### Conventions

- Image placeholders use null byte format: `\x00IMG:n\x00`
- Heading lines marked with `\x01{level}` prefix (e.g., `\x012` for H2) for pager navigation and sticky headers
- `INDENT = 2` spaces for consistent left margin
