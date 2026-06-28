# Architecture

How `sanemd` turns a markdown file into an interactive terminal viewer.

## Bird's-eye view

```
file path (argv)
   │
   ▼
preprocess (mermaid → ASCII)
   │
   ▼
buildTree (marked lexer → typed AST + flat TOC + headingIds)
   │
   ▼
createCliRenderer + createRoot.render(<App ... />)
   │
   ▼
App owns reactive state ──▶ <StickyHeader> <Viewer> <Toc> <StatusLine>
                                  │
                                  ▼
                       <NodeRenderer> per AST node
                                  │
                                  ▼
                            OpenTUI renderables
```

Entry: `src/sanemd.tsx`. Everything else lives under `src/app/`.

## 1. Entry pipeline (`src/sanemd.tsx`)

1. **Parse argv** — first non-flag positional becomes `filePath`. No stdin: TTY is required (the renderer needs one to drive raw-mode input).
2. **Read file** — `Bun.file(filePath).text()`.
3. **Preprocess** — `replaceMermaidBlocks` (see [Preprocessing](#preprocessing)).
4. **Build AST** — `buildTree(markdown)` returns `{ nodes, toc, headingIds }`.
5. **Render** — `createCliRenderer({ exitOnCtrlC: false })`, then `createRoot(renderer).render(<App ... />)`. `App` receives the AST plus a `fileLabel` derived from `<parentDir>/<basename>`.

Exit on `Ctrl-C` is wired explicitly through the key dispatcher so the same path covers `q`, `Ctrl-C`, and forced teardown.

## 2. Preprocessing (`src/app/lib/preprocess.ts`)

`replaceMermaidBlocks` finds ` ```mermaid ` fences, hands the body to `beautiful-mermaid`'s `renderMermaidAscii`, trims trailing whitespace per line, and re-wraps the result in a `mermaid` fence so the AST step sees a normal code block. Render failures fall through to the original raw block — never throw.

## 3. AST (`src/app/lib/ast.ts`)

`buildTree(markdown)` is the single source of truth for document structure. It:

1. Runs `marked.lexer(markdown)` (a `kbd` inline tokenizer is registered globally on `marked`).
2. Walks the token stream with `blockToNode` and `inlineToNode`, producing the typed `Node` / `InlineNode` unions defined in `ast.ts`. Generic `marked` tokens are narrowed at the boundary; no `as` cascades downstream.
3. Post-processes in three lifts:
   - `wrapDetails` — re-joins `<details>` openers/bodies/closers (marked splits them across separate `html` tokens) into a single `details` node so the body keeps full markdown rendering.
   - `liftHtmlBlocks` — when an `html` block contains block-level markdown (headings, lists, …), it re-lexes the markdownified HTML and inlines the resulting nodes. Adds a synthetic `space` after the lifted block when the next sibling isn't already a `space`, because marked folds the trailing blank line into the html token's `raw`.
   - `liftSingleImageParagraphs` and `liftSingleImageHtml` — collapse `<p><img/></p>` and stand-alone `<img>` HTML blocks into top-level `image` nodes so the block renderer can render them at full width.
4. Builds the TOC: `blockToNode` pushes each heading into a flat `TocFlat` array while assigning unique slugs (collisions get a `-2`, `-3`, … suffix tracked by `ctx.usedSlugs`). `nestToc` then folds the flat list into a tree by maintaining a level stack.
5. Collects `headingIds` (a flat array of every heading id in document order, recursing through `blockquote`, `details`, and `list` children).

The output (`{ nodes, toc, headingIds }`) is immutable for the life of the process. State changes only the _view_ over this data.

### Node identity convention

Heading nodes carry an `id` (slug). The renderer for `Heading` emits a `<box id={node.id}>`, which lets the Viewer resolve heading boxes through `box.content.findDescendantById(id)`. This single convention powers scroll-into-view, near-top detection, visibility tracking, and TOC selection.

## 4. App shell (`src/app/App.tsx`)

`App` is the only stateful component. It:

- Holds `useState` for `focus`, `currentHeadingId`, `expanded`, `tocCursorId`, `search`, `mouseEnabled`, and `visibleHeadingIds`.
- Holds a `useRef<ScrollboxHandle>` (`viewerRef`) for imperative scroll calls — see [Imperative scroll](#imperative-scroll).
- Computes layout each render from `useTerminalDimensions`:
  - `tocWidth = clamp(16, contentWidth + 3, floor(termWidth * 0.4))` (3 cols for the inner scrollbox's paddingX + a buffer).
  - `viewerColumnWidth = (hasToc ? termWidth - tocWidth : termWidth) - 2` (2 cols for the viewer scrollbar + paddingRight).
  - `contentWidth = min(CONTENT_MAX_WIDTH, viewerColumnWidth)` — exposed via context so block renderers can size to it.
- Memoises an `AppState` object into `AppStateContext` so descendants read state via `useAppState()`.
- Wires `useKeyboard` → `mapKey(ev, focus, { searchActive })` → `dispatch(action, state, toc, headingIds, renderer.height, onQuit)`. When `focus === 'search'`, `App` skips dispatch entirely — `SearchInput` owns its own `useKeyboard`.
- Runs two effects:
  - When the search index/pattern changes, scroll the nearest preceding heading into view so the highlighted match is visible.
  - On first paint (and whenever `headingIds` changes), populate `visibleHeadingIds` once via the viewer handle so the sticky header's hide-when-visible rule fires before any keypress.

Layout (rendered tree):

```
<box flexDirection=column height=100%>
  <StickyHeader />                  ← height 2; zIndex 10
  <box flexDirection=row flexGrow=1 overflow=hidden>
    <Viewer />                      ← scrollbox, contentWidth + overhead
    {hasToc && <box width=tocWidth><Toc /></box>}
  </box>
  <StatusLine />                    ← height 1
</box>
```

## 5. State (`src/app/state.ts`)

`AppState` is the context value. Notable fields:

- `focus: 'viewer' | 'sidebar' | 'search'` — drives `mapKey` dispatch and the TOC cursor highlight.
- `currentHeadingId: string | null` — heading at/just-above viewport top, or last-jumped-to. Re-synced after every scroll.
- `visibleHeadingIds: Set<string>` — every heading whose box vertically intersects the viewport. Used by `StickyHeader` to blank crumbs while their heading is on-screen.
- `expanded: Map<string, boolean>` — per-id TOC fold state. Default per entry is `level <= 2` (see `defaultExpanded`).
- `tocCursorId: string | null` — TOC keyboard cursor (independent of `currentHeadingId`).
- `search: SearchState | null` — `{ pattern, matches, index, dir }`.
- `viewerRef: RefObject<ScrollboxHandle>` — imperative scroll API.
- `contentWidth: number` — Viewer's inner content width after subtracting TOC, scrollbar, and padding; capped to `CONTENT_MAX_WIDTH` (100).

`ScrollboxHandle` is the only place mutation crosses the React boundary. See [Imperative scroll](#imperative-scroll).

## 6. Key dispatch

Two pure modules, one driver.

### `src/app/lib/keys.ts`

`mapKey(ev, focus, ctx)` returns a discriminated `Action`. `Ctrl-C` is intercepted up front. Otherwise:

- `focus === 'sidebar'` → `mapSidebar`: j/k/↑↓ cursor, space toggles expand, return selects, tab/escape returns to viewer.
- Else → `mapViewer`: j/k/↑↓ line, space/b page, d/u half-page, g/G top/bottom, n/N heading nav (or match nav when `searchActive`), `/` and `?` start search, escape clears search, tab focuses sidebar, m toggles mouse.

`mapKey` returns `{ kind: 'noop' }` for unknown keys — never throws, never reads state.

### `src/app/lib/dispatch.ts`

`dispatch(action, state, toc, headingIds, viewportHeight, onQuit)` is the only place that touches state setters and the viewer ref. Three internal helpers:

- `syncCurrentHeading` — after any scroll, asks the viewer for the heading nearest the viewport top; updates `currentHeadingId` and `visibleHeadingIds` when they change.
- `jumpHeading` — n/N. Seeds the cursor from the near-top heading if the user has been scrolling with j/k, then walks `headingIds`, scroll-pins the target to the top, and refreshes `visibleHeadingIds`.
- `refreshVisible` — recomputes `visibleHeadingIds` from the viewer, diff-skips with `setsEqual` to avoid spurious re-renders.

Match nav delegates to the index arithmetic in `dispatch` (`((index + delta) % total + total) % total`) and lets the `App` effect handle scrolling the new match into view.

## 7. Viewer & imperative scroll (`src/app/components/Viewer.tsx`)

The viewer is a `<scrollbox>` wrapping `<NodeList>` plus a trailing `<box height={tailSpace}>` so the _last_ heading can still scroll to the top of the viewport (`tailSpace = max(0, termHeight - 4)`).

On mount, it constructs a `ScrollboxHandle` from the raw `ScrollBoxRenderable` ref:

| Method                        | Implementation                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `scrollBy(d)` / `scrollTo(y)` | `box.scrollBy` / `box.scrollTo`                                                        |
| `scrollToBottom()`            | `box.scrollTo(box.scrollHeight)` (polyfill)                                            |
| `scrollChildIntoView(id)`     | `box.scrollChildIntoView(id)`                                                          |
| `scrollChildToTop(id)`        | Find child by id, `scrollBy(child.y - viewport.y - PIN_TOP_OFFSET)`                    |
| `getHeadingNearTop(ids)`      | Heading id with the largest `child.y <= viewport.y`, else the first below the viewport |
| `getVisibleHeadingIds(ids)`   | Headings where `childBottom > viewport.y && childTop < viewport.y + viewport.height`   |

It also installs `installRealisticThumb`, which patches the scrollbar slider's `viewPortSize` to exclude the synthetic tail spacer so the thumb reflects real content size.

`focusable={false}` is intentional — `focused={false}` is a no-op on mount; this avoids click-focus re-enabling OpenTUI's built-in j/k handler that would compete with our dispatcher.

## 8. Sticky breadcrumb (`src/app/components/StickyHeader.tsx`)

Two-row chrome above the viewer:

- **Row 1**: H1 title (or `fileLabel` when the document has no H1). Suppressed while the H1 is in `visibleHeadingIds`.
- **Row 2**: `#…#` prefix plus the _current_ heading's inline. Suppressed when (a) the current heading is itself visible in the viewport, or (b) the current heading _is_ the H1 (would duplicate row 1).

Both rows blank to a single space rather than collapsing, so the layout doesn't jitter. The background uses `theme.stickyBg` and the box sits at `zIndex 10` to draw over the viewer.

## 9. TOC (`src/app/components/Toc.tsx`)

`flattenVisible(toc, expanded)` produces the rendered list (collapsed subtrees are pruned). Each row shows:

- `'  '.repeat(level - 1)` indent.
- Marker: `▾` (expanded with children) / `▸` (collapsed with children) / `•` (leaf).
- Inline rendered via `<MutedInline>`; the current entry is wrapped in `<strong>` over `theme.tocCurrent`.
- The cursor row gets `theme.tocFocusBg` background while `focus === 'sidebar'`.

Width is computed by `tocContentWidth` in `toc-util.ts` (`INDENT_PER_LEVEL * (level-1) + MARKER_WIDTH + inlineVisibleWidth(inline)`), clamped in `App.tsx`.

## 10. Search (`src/app/lib/search.ts`, `match-nav.ts`, `components/SearchInput.tsx`)

`findMatches(nodes, pattern)` walks the AST and returns `Match[]`, each carrying:

- `blockPath: number[]` — index path through nested block containers (`list` → `[..., listIndex, itemIndex]`, `blockquote` → `[..., bqIndex, childIndex]`, `table` → `[..., tableIndex]`).
- `inlinePath: number[]` — index path through inline nodes. For tables, `[rowIndex, columnIndex]` with `rowIndex === -1` for headers.
- `offset`, `length` — visible-character offset and length within the leaf text node (text / codespan / kbd / image alt).

Matching is case-insensitive (`new RegExp(escapeRegex(pattern), 'gi')`). `<br>` is skipped.

Flow:

1. `/` or `?` in viewer → `dispatch` produces `startSearch` → `setSearch({ pattern: '', matches: [], index: -1, dir })` and `setFocus('search')`.
2. `SearchInput` mounts as the status line; owns its `useKeyboard`. Enter commits → `findMatches(nodes, value)` → `setSearch({ pattern, matches, index: matches.length ? 0 : -1 })` → focus back to viewer. Escape clears search.
3. `App` effect on `search.index` / `search.pattern` change → `nearestPrecedingHeadingId(nodes, match)` → `scrollChildIntoView(id)`.
4. With search active, `n` / `N` are remapped (in `mapViewer`) to `nextMatch` / `prevMatch`. Without it, they fall through to heading nav.

`nearestPrecedingHeadingId` walks the top-level node list up to `match.blockPath[0]` and returns the last heading id seen (or null if the match precedes every heading).

## 11. Block renderers (`src/app/components/blocks/*`)

`NodeList` maps over the AST. `NodeRenderer` is a single `switch` dispatching to per-kind components: `Heading`, `Paragraph`, `CodeBlock`, `List`, `Blockquote`, `Table`, `Details`, `HtmlBlock`, `ImageBlock`, plus an inline `Hr`. `space` becomes a `<box height={1}>`.

Inline rendering goes through `InlineRenderer` (full styling) or `MutedInline` (single-color variant used in the sticky header and TOC).

Width-aware components read `contentWidth` from `useAppState()`.

## 12. Styling

- `src/app/styles/theme.ts` — VS Code Dark+ inspired color tokens (`theme.foreground`, `theme.stickyBg`, `theme.tocCurrent`, etc.).
- `src/app/styles/layout.ts` — layout constants (`CONTENT_MAX_WIDTH = 100`).
- `src/app/styles/syntax-style.ts` — code-block syntax theme.

## Data-flow summary

```
keypress ──▶ mapKey ──▶ Action ──▶ dispatch ──┬──▶ state setters (re-render)
                                              │
                                              └──▶ viewerRef.current (imperative scroll)
                                                       │
                                                       └──▶ syncCurrentHeading / refreshVisible
                                                                  │
                                                                  └──▶ state setters (re-render)
```

The only mutable cross-boundary surface is `ScrollboxHandle`. Everything else flows through React state, and the AST itself is immutable for the lifetime of the process.

## Testing

`bun:test` (not vitest/jest). Each pure module has a sibling `*.test.ts`: `ast.test.ts`, `dispatch.test.ts`, `html.test.ts`, `keys.test.ts`, `match-nav.test.ts`, `preprocess.test.ts`, `search.test.ts`, `toc-util.test.ts`. Mocks via `mock()` from `bun:test`. The Viewer/imperative-scroll surface is not unit-tested directly — it's exercised by integration through `dispatch.test.ts` against a fake `ScrollboxHandle`.
