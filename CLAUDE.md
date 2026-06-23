# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## Commands

```bash
bun test                              # Run tests (uses bun:test — NOT vitest)
bun test --watch                      # Watch mode
bun test src/app/lib/ast.test.ts      # Single test file
bun run typecheck                     # tsc --noEmit

./src/sanemd.tsx README.md            # Run CLI (requires a TTY)
```

Piping/stdin is not supported — `sanemd` requires a TTY.

## Architecture

Interactive terminal markdown viewer built on **OpenTUI** (`@opentui/core` + `@opentui/react`). Markdown is parsed once into an AST and rendered as a tree of React components inside a scrollable viewport with a TOC sidebar, sticky breadcrumb header, and status line.

### Pipeline (`src/sanemd.tsx`)

1. **Parse args + read file** — TTY-only; no stdin.
2. **Preprocess** (`src/app/lib/preprocess.ts`) — `replaceMermaidBlocks`, `replaceKbdTags`.
3. **Build AST** (`src/app/lib/ast.ts`) — produces `{ nodes, toc }` from markdown.
4. **Render** — `createCliRenderer` + `createRoot(renderer).render(<App ... />)`.

`App` owns reactive state; imperative scroll lives in a `ScrollboxHandle` exposed by `Viewer` via `viewerRef`.

### Layout

```
StickyHeader      ← breadcrumb chrome (bg tint, hides crumbs of visible headings)
Viewer | Toc      ← scrollable content + sidebar (sidebar width = content width, clamped)
StatusLine        ← bottom row
```

### Key modules

- **`src/app/App.tsx`** — top-level component; owns `AppState`, keyboard wiring (`useKeyboard` → `mapKey` → `dispatch`).
- **`src/app/state.ts`** — `AppState` (React state) + `ScrollboxHandle` (imperative scroll API). `visibleHeadingIds: Set<string>` tracks which headings intersect the viewport for sticky-crumb hiding.
- **`src/app/lib/ast.ts`** — markdown → typed AST (`Node`, `InlineNode`, `TocEntry`).
- **`src/app/lib/dispatch.ts`** — action dispatcher; `syncCurrentHeading` refreshes `currentHeadingId` + `visibleHeadingIds` after every scroll; `jumpHeading` does the same after heading navigation.
- **`src/app/lib/keys.ts`** — key event → `Action` mapping.
- **`src/app/lib/toc-util.ts`** — `buildBreadcrumbs`, `flattenVisible`, `tocContentWidth`, etc.
- **`src/app/lib/search.ts` / `match-nav.ts`** — pattern matching + match-to-heading mapping.
- **`src/app/lib/preprocess.ts`** — mermaid → ASCII, `<kbd>` → styled placeholder.
- **`src/app/components/Viewer.tsx`** — scrollbox wrapper; implements `getHeadingNearTop` and `getVisibleHeadingIds` against opentui's renderable tree (`box.viewport`, `box.content.findDescendantById`). Also patches the scrollbar thumb to ignore the synthetic tail spacer.
- **`src/app/components/StickyHeader.tsx`** — breadcrumb chrome. Each row blanks while its heading is in `visibleHeadingIds`.
- **`src/app/components/Toc.tsx`** — collapsible TOC sidebar.
- **`src/app/components/blocks/*`** — per-AST-node renderers (`Heading`, `Paragraph`, `List`, `Table`, `CodeBlock`, `Blockquote`, `InlineRenderer`, `MutedInline`, `NodeRenderer`).
- **`src/app/styles/theme.ts`** — VS Code Dark+ inspired color tokens.
- **`src/app/styles/layout.ts`** — layout constants (e.g. `CONTENT_MAX_WIDTH`).

### Block `id` convention

Heading blocks render a `<box id={node.id} ...>` so `Viewer` can locate them via `box.content.findDescendantById(id)` for scroll-into-view, near-top detection, and visibility checks.

## Conventions

- Tests use `bun:test` (not vitest, not jest). Mocks via `mock()` from `bun:test`.
- Functions top-down: exports before helpers.
- `import type` separated from value imports, even from the same module.
- Avoid type assertions / non-null `!`; fix at the source.
- No fossil comments. No comments describing what removed code used to do.
- Conventional Commits. First commit on a branch carries the scope; subsequent commits prefer `chore` (squashed).

## Ubiquitous Language

| Term                | Definition                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Viewer              | The scrollable content area (`<scrollbox>`)                                                 |
| Viewport            | The currently visible region of the Viewer (`box.viewport.{y,height}`)                      |
| TOC                 | Table-of-contents sidebar; collapsible tree of `TocEntry`                                   |
| Current heading     | `currentHeadingId` — heading at/just-above viewport top, or last-jumped-to                  |
| Visible headings    | `visibleHeadingIds` — set of heading ids whose box intersects the viewport                  |
| Breadcrumb          | Ancestor chain of `currentHeadingId`, rendered in `StickyHeader`                            |
| Synth root          | Filename label substituted as the first breadcrumb when the doc has no H1                   |
| Crumb               | One row in the breadcrumb; `{ id, inline, indent }`. Hidden while `id ∈ visibleHeadingIds`. |
| Focus               | `'viewer' | 'sidebar' | 'search'` — drives key dispatch                                     |
| Scrollbox tail      | Empty `<box height={tailSpace}>` after content so the last heading can scroll to top        |
