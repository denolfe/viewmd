# Architecture

How `viewmd` turns a markdown file into an interactive terminal viewer.

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

Entry: `src/index.tsx`. Everything else lives under `src/app/`.

## 1. Entry pipeline (`src/index.tsx`)

1. **Parse argv** — `parseArgs` (`src/app/lib/args.ts`) returns `{ filePath?, forceRender? }`. First non-flag positional becomes `filePath`; `--render`/`-r` sets `forceRender`.
2. **Load config** — `loadConfig(process.env)` (`src/app/lib/config.ts`) resolves the config path (`$VIEWMD_CONFIG` → `$XDG_CONFIG_HOME/viewmd/config.toml` → `~/.config/viewmd/config.toml`), parses the TOML if present, and validates each key; malformed files or bad values become stderr warnings rather than throws. `resolveSettings({ config, env, flags })` then merges config with the CLI flags and environment (`FZF_PREVIEW_LINES`, `FZF_PREVIEW_COLUMNS`) to produce `{ contentMaxWidth, maxLines }`, flag > env > config > built-in default.
3. **Read input** — `Bun.file(filePath).text()` when a file path is given; otherwise `Bun.stdin.text()` when stdin is non-TTY; otherwise a usage error.
4. **Preprocess** — `replaceMermaidBlocks` (see [Preprocessing](#preprocessing)).
5. **Build AST** — `buildTree(markdown)` returns `{ nodes, toc, headingIds }`.
6. **Branch on mode**:
   - **Render mode** (`forceRender || !process.stdout.isTTY`): `renderAnsi({ nodes, width, maxHeight, capRows })` mounts a body-only `<RenderView>` into OpenTUI's headless `createTestRenderer`, waits for visual idle (so async tree-sitter highlight commits), captures one frame via `captureSpans()`, converts spans → 24-bit SGR ANSI, trims trailing blank rows, and writes to stdout via `Bun.write`. Width is `FZF_PREVIEW_COLUMNS` → `process.stdout.columns` → 80, clamped to a minimum of 20. `maxHeight` defaults to 2000. `capRows` = `--max-lines` > `FZF_PREVIEW_LINES` > none; when set, only nodes estimated within the cap mount, highlight waits cover only those, and output is truncated to `capRows` lines.
   - **Interactive mode**: any config `warnings` are written to stderr _before_ `createCliRenderer`, so they land on the main screen the alternate screen preserves and restores on quit. (OpenTUI hijacks `console.*` and its teardown bypasses process `exit` handlers, so neither a console call nor an exit hook would reach the user.) Then `createCliRenderer({ exitOnCtrlC: false })` and `createRoot(renderer).render(<App ... />)`. `App` receives the AST plus a `fileLabel` derived from `<parentDir>/<basename>` and `settings.contentMaxWidth`.

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

Heading nodes carry an `id` (slug). The renderer for `Heading` emits a `<box id={node.id}>`, which lets the scroll seam resolve heading boxes through the `BoxGeometry` port, whose lookups walk the renderable tree with `collectById` (`src/app/lib/renderable-tree.ts`). This single convention powers scroll-into-view, near-top detection, visibility tracking, and TOC selection.

## 4. App shell (`src/app/App.tsx`)

`App` is the only stateful component. It:

- Holds the nine view-state fields (`focus`, `currentHeadingId`, `visibleHeadingIds`, `expanded`, `tocCursorId`, `search`, `tocVisible`, `helpVisible`, `mouseEnabled`) in one `useViewState({ seedVisible })` store (`src/app/lib/view-state.ts`): a single `useState<ViewState>` plus a stable `useCallback` writer per field, memoised into a `ViewActions` object. `status` (status-line state) and `covering` (nav-swap cover) stay as their own local `useState` — they're App-local UI flags, not part of the shared view-state read model.
- Derives `stateRef = useLatest(view)` (`src/app/lib/useLatest.ts`) — a ref updated to the latest `ViewState` on every render — so effectful code can read current state without becoming a render dependency.
- Holds a `useRef<ScrollboxHandle>` (`viewerRef`) for imperative scroll calls — see [Imperative scroll](#imperative-scroll).
- Computes layout each render from `useTerminalDimensions`:
  - `tocWidth = clamp(16, contentWidth + 3, floor(termWidth * 0.4))` (3 cols for the inner scrollbox's paddingX + a buffer).
  - `viewerColumnWidth = (hasToc ? termWidth - tocWidth : termWidth) - 2` (2 cols for the viewer scrollbar + paddingRight).
  - `contentWidth = min(CONTENT_MAX_WIDTH, viewerColumnWidth)` — exposed via context so block renderers can size to it.
- Memoises an `AppState` object into `AppStateContext` so descendants read state via `useAppState()`.
- Wires `useKeyboard` → `mapKey(ev, focus, { searchActive, helpOpen })` → `dispatch(action, commands)`. When `focus === 'search'`, `App` skips dispatch entirely — `SearchInput` owns its own `useKeyboard`.
- Runs two effects:
  - When the search index/pattern changes, jump less-style: scroll the match line to a few context rows (`JUMP_CONTEXT_ROWS`) below the sticky overlay of its nearest preceding heading (`matchScrollTarget` + `jumpToMatch`).
  - On first paint (and whenever `headingIds` changes), populate `visibleHeadingIds` once via the viewer handle so the sticky header's hide-when-visible rule fires before any keypress.

Layout (rendered tree):

```
<box flexDirection=column height=100%>
  <box flexDirection=row flexGrow=1 overflow=hidden position=relative>
    <StickyHeader />                ← absolute overlay; top/left 0; zIndex 10
    <Viewer />                      ← scrollbox, contentWidth + overhead
    {hasToc && <box width=tocWidth><Toc /></box>}
  </box>
  <StatusLine />                    ← height 1
</box>
```

`StickyHeader` is `position=absolute` inside the `position=relative` row, so it is
out of flex flow — only the `StatusLine` (height 1) sits below the viewport, and
`Viewer`'s `tailSpace = height - 2` reflects that.

## 5. State (`src/app/state.ts`)

`AppState` is the context value `App` memoises into `AppStateContext` — a read model assembled each render from the `useViewState` store's `view` plus `status`/`commands`/layout fields computed in `App`. Components only ever read it via `useAppState()`; they never see `ViewState`, `stateRef`, or `actions` directly. Notable fields:

- `focus: 'viewer' | 'sidebar' | 'search'` — drives `mapKey` dispatch and the TOC cursor highlight.
- `currentHeadingId: string | null` — heading at/just-above the visible content top, or last-jumped-to. Re-synced after every scroll.
- `visibleHeadingIds: Set<string>` — every heading whose box vertically intersects the visible content region. Used by `StickyHeader` to blank ancestor rows while their heading is on-screen.

Both are measured against **the content below the sticky overlay**, not the raw viewport top: `src/app/lib/fold.ts`'s `Fold.resolveAt` takes a `topOffset`. The offset is the current heading's **ancestor-stack height** (`Fold.offsetFor` — ancestors + synth root, excluding the heading itself), the same value a jump uses, so scrolling to a heading resolves identically to navigating to it. `Fold.resolveCurrent` finds it as a fixed point over the current heading, bailing if an offset repeats (a shallow heading at a deeper one's fold can cycle). Excluding the heading's own ancestor row from the offset is deliberate: including it (an earlier approach) made the offset self-referential, so at a boundary both "row shown" and "row hidden" were consistent and the overlay flickered a frame as you scrolled past a header. Without any offset, a heading scrolling behind the overlay would count as "visible" (dropped from the overlay) yet be hidden behind it — vanishing instead of becoming an ancestor row.

- `expanded: Map<string, boolean>` — per-id TOC fold state. Default per entry is `level <= 2` (see `defaultExpanded`).
- `tocCursorId: string | null` — TOC keyboard cursor (independent of `currentHeadingId`).
- `search: SearchState | null` — `{ pattern, matches, index, dir }`.
- `viewerRef: RefObject<ScrollboxHandle>` — imperative scroll API.
- `contentWidth: number` — Viewer's inner content width after subtracting TOC, scrollbar, and padding; capped to `CONTENT_MAX_WIDTH` (100).

`ScrollboxHandle` is the only place mutation crosses the React boundary. See [Imperative scroll](#imperative-scroll).

## 6. Key dispatch

Pure key mapping, an effectful command layer, and a pure dispatcher between them.

### `src/app/lib/keys.ts`

`mapKey(ev, focus, ctx)` returns a discriminated `Action`. `Ctrl-C` is intercepted up front. Otherwise:

- `focus === 'sidebar'` → `mapSidebar`: j/k/↑↓ cursor, space toggles expand, return selects, tab/escape returns to viewer.
- Else → `mapViewer`: j/k/↑↓ line, space/b page, d/u half-page, g/G top/bottom, n/N heading nav (or match nav when `searchActive`), `/` and `?` start search, escape clears search, tab focuses sidebar, m toggles mouse.

`mapKey` returns `{ kind: 'noop' }` for unknown keys — never throws, never reads state.

### `src/app/lib/commands.ts`

`createCommands(deps: CommandDeps)` builds the `Commands` object — the only place that touches the viewer ref and writes view state. `CommandDeps` carries `stateRef: RefObject<ViewState>` (from `useLatest`, see [App shell](#4-app-shell-srcappapptsx)) and `actions: ViewActions` (from `useViewState`) instead of per-field state/setters, plus `doc`, `fold`, `viewportHeight`, `historyDepth`, `nav`, `onQuit`, `onOpenEditor`. Each command reads current state via `stateRef.current.*` and writes via `actions.*`. Because commands close over the ref rather than the state values themselves, `createCommands` has no per-field dependency — `App`'s `useMemo` only rebuilds it on doc/nav swap and viewport resize, not on every keystroke or scroll. Internal helpers:

- `resolveHeadings` — after any scroll, asks the viewer for the heading nearest the viewport top (via `Fold.resolveCurrent`); applies `actions.currentHeadingId`/`actions.visibleHeadingIds` only when they change.
- `jumpTo` / `jumpHeadingBy` — n/N and TOC jumps. Seeds the cursor from the near-top heading if the user has been scrolling with j/k, then walks `headingIds`, scroll-pins the target to the top (offset by `Fold.offsetFor`), and refreshes `visibleHeadingIds`.
- `refreshVisible` — recomputes `visibleHeadingIds` from the viewer, diff-skips with `setsEqual` to avoid spurious re-renders.

`createNoopCommands()` returns an all-no-op `Commands` for the non-interactive render path, where no key/mouse input is ever dispatched.

### `src/app/lib/dispatch.ts`

`dispatch(action, commands)` is a pure `switch` mapping each `Action['kind']` to the matching `Commands` method — it holds no state and touches nothing effectful itself. Match nav delegates to the index arithmetic inside `commands.stepMatch` (`((index + delta) % total + total) % total`) and lets the `App` effect handle scrolling the new match into view.

## 7. Viewer & imperative scroll (`src/app/components/Viewer.tsx`, `src/app/lib/scrollbox-handle.ts`)

The viewer is a `<scrollbox>` wrapping `<NodeList>` plus a trailing `<box height={tailSpace}>` so the _last_ heading can still scroll to the top of the viewport (`tailSpace = max(0, termHeight - 1 - tailReserve)`, where `tailReserve` is the last heading's overlay height).

On mount it calls `createScrollboxHandle` (`src/app/lib/scrollbox-handle.ts`) with the raw `ScrollBoxRenderable` ref plus a `live` bag of getters (`tail`, `projections`, `isFullyMounted`, `contentWidth`, `mountedCount`, `docKey`); the seam owns the geometry port, the pending protocol and the scrollbar patches, and hands back `{ handle, onFrame, requestNotify, dispose }`. The main handle methods:

| Method                            | Implementation                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scrollBy(d)` / `scrollTo(y)`     | `box.scrollBy` / `box.scrollTo`                                                                                                                    |
| `scrollToBottom()`                | `box.scrollTo(box.scrollHeight)` (polyfill)                                                                                                        |
| `scrollChildToTop(id, topOffset)` | Find child by id, `scrollBy(childToTopDelta(geom, id, topOffset))` (`fold.ts`)                                                                     |
| `getGeometry()`                   | Returns the live `BoxGeometry` port; callers pass it into `Fold` methods (`src/app/lib/fold.ts`) for heading-near-top / visible-heading resolution |

The seam also installs the two scrollbar patches in `src/app/lib/scrollbar-patch.ts`: `installRealisticThumb` patches the scrollbar slider's `viewPortSize` to exclude the synthetic tail spacer so the thumb reflects real content size, and `watchScroll` patches `scrollPosition` so wheel/drag scrolls notify the same listeners a keyboard scroll does.

`focusable={false}` is intentional — `focused={false}` is a no-op on mount; this avoids click-focus re-enabling OpenTUI's built-in j/k handler that would compete with our dispatcher.

### Progressive mount

Large docs mount in a growing prefix instead of all at once, so first paint isn't gated on
the whole tree. `initialMountCount` (`src/app/lib/progressive.ts`) picks the initial prefix
length by walking nodes with low-biased row estimates (`estimateNodeRows`) until the
cumulative estimate reaches `2×` the viewport height — enough to fill the screen with
margin for estimate error. After first paint, a `useEffect` grows `mountedCount` by
`CHUNK_SIZE` (32) nodes per tick, each tick a `setTimeout(0)` so the event loop gets a turn
between commits and keyboard/scroll stay responsive during mount. `estimateTotalRows` sizes
an estimated `<box height={estimatedRemaining}>` spacer between the mounted prefix and the
tail box, standing in for unmounted content so the scrollbar thumb and `G` read
approximately right until the doc finishes mounting.

Jumps into content that hasn't mounted yet (heading nav, search, post-swap pins) can't
resolve immediately. That retry/supersede/settle logic is a **pure reducer**,
`pendingReducer` (`src/app/lib/pending-reducer.ts`), and the scroll seam is a thin adapter over it.
The reducer state is `{ pending, isSwap }`; it maps events (`issueJump · pinJump · userScroll
· frameTick`) to effects (`scrollBy · repositioned`) and never touches live geometry. Each
frame the adapter resolves the current `pending` target against the box into a plain
`Resolution` (`{ delta, reached } | null`, computed with the delta fns in
`viewport-geometry.ts`) and feeds it in as a `frameTick`; it applies the returned effects.
Retries run on the renderer's `frame` event, not inside a React effect: a just-committed
chunk's renderables still read `y=0` until the next layout pass, so effect-time geometry
would land the jump at the top. A pending is cleared once its target resolves or the doc is
fully mounted (`reached || fullyMounted`). A scroll that **actually moves** the viewport
(wheel/drag/keyboard, surfaced as a `userScroll` event) supersedes a pending jump — otherwise
a stale pending would yank the viewport back once its chunk mounts; a clamped no-op scroll
(e.g. pressing down at the bottom) leaves the pending intact. Post-swap pins (`pinJump`) carry
`isSwap`, so their settle fires `repositioned` exactly once — the signal the shell uses to drop
the navigation cover. Once `mountedCount >= nodes.length`, a deferred notify (fired on the next
`frame`) re-syncs headings/marks so the overlay and scroll indicators reflect the
now-complete tree.

### Scroll indicators (`src/app/components/ScrollIndicators.tsx`)

The scrollbox is wrapped in a `position=relative` box; `ScrollIndicators` renders as an **absolute** sibling pinned to the right column (`width={1}`), painting **search-match** tick marks over the scrollbar track. The overlay only appears while a search is active; each marker cell takes `theme.scrollbarThumb` as its background (the same color set on the scrollbox's `verticalScrollbarOptions.trackOptions.foregroundColor`) so a mark reads as part of the bar, while unmarked rows stay transparent so the real track/thumb shows through.

Block boxes carry a stable id via `blockId(path)` (`src/app/lib/scroll-marks.ts`), keyed by the block's index path through the AST — the same convention headings already use via their slug `id`. `Match.blockElementId` (stamped during search) joins a match back to its block box, so `getScrollMarks` can resolve the block through the `BoxGeometry` port — `findChildren` / `collectTextBearersFor`, both one `collectById` walk over the renderable tree — and then locate the exact visual line within it via `plainText`/`lineInfo` (falling back to the block's own `y` if no text-bearing descendant is found).

`computeTrackCells` (pure, in `scroll-marks.ts`) maps each resolved mark's document-space `y` onto a track row proportionally (`round(y / scrollHeight * viewportHeight)`), independent of scroll position. It maps over the **full `scrollHeight`** (tail included) — the exact scale OpenTUI positions the thumb with (`thumbTop = scrollPosition / scrollHeight * trackHeight`), so a mark for a match lands inside the thumb once you navigate to it; `realContentHeight` (scrollHeight minus tail) is used only to suppress the overlay when the whole document already fits the viewport. Marks resolve on **reflow**, not on every scroll tick: `createMarkCache` (`src/app/lib/mark-cache.ts`) re-resolves only when the seam's reflow key (`docKey:contentWidth:mountedCount`) changes, latched in `onFrame` so it always describes the laid-out state rather than the pending render. A key change also fires a notify, so `ScrollIndicators` re-reads on a resize or TOC toggle without waiting for a scroll. It reads the current layout off `viewerRef`, on a `setTimeout(…, 0)` after mount/search changes and on every scroll notification. When several marks land on the same row, the highest-priority kind wins (`activeMatch > match`), painted with `theme.scrollMarkActive` / `scrollMarkMatch`. With no active search or on a non-scrollable document (`contentHeight <= trackHeight`), `computeTrackCells` returns no cells and the overlay renders nothing.

## 8. Sticky overlay (`src/app/components/StickyHeader.tsx`)

An **absolute overlay** over the top of the viewer (VS Code "sticky scroll" model), not a chrome row. The box is `position=absolute` at `top/left 0` of the viewer's `position=relative` row container, sized to `contentWidth`, `zIndex 10`, on `theme.stickyBg`. Being out of Yoga's flow, it never changes the viewer's height — the rows paint _over_ the top content lines rather than pushing content down, so the overlay can grow from zero without the content region reflowing.

Content is `ancestorRows({ chain, visibleHeadingIds, hasH1, fileLabel })` (in `overlay-rows.ts`), where `chain = ancestorChain(toc, currentHeadingId)` is the root→current lineage:

- Every ancestor row whose `id ∈ visibleHeadingIds` is dropped. At the top of the doc the H1 is on-screen, so the chain filters to empty and **nothing** is drawn — the overlay starts empty and accumulates as headings scroll off the top.
- **Row 1** is the H1 rendered as a bold pill (`theme.h1Bg`/`h1Fg`), or the `fileLabel` synth root when the doc has no H1 (shown only once a real ancestor row survives the filter).
- **Deeper rows** render muted (`theme.headingMuted`) with a `#…#` level prefix.

Jumps (`tocSelect`, `nextHeading`/`prevHeading`) call `scrollChildToTop(id, ancestorChain(toc, id).length - 1)` so the target lands just _below_ its ancestor stack instead of hidden underneath it.

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
3. `App` effect on `search.index` / `search.pattern` change → `matchScrollTarget(...)` → `jumpToMatch({ match, matches, index, topOffset })`.
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
keypress ──▶ mapKey ──▶ Action ──▶ dispatch ──▶ Commands (createCommands)
                                                     │
                                    ┌────────────────┴────────────────┐
                                    ▼                                 ▼
                          actions.* (ViewActions)          viewerRef.current (imperative scroll)
                                    │                                 │
                                    ▼                                 ▼
                       useViewState setState               resolveHeadings / refreshVisible
                                    │                                 │
                                    └─────────── re-render ◀──────────┘
```

The only mutable cross-boundary surface is `ScrollboxHandle`. Commands read/write view state through `stateRef`/`actions` rather than closing over React state directly, but the state itself still lives in `useViewState`'s React state and every update still re-renders through it. The AST itself is immutable for the lifetime of the process.

## Testing

`bun:test` (not vitest/jest). Each pure module has a sibling `*.test.ts`: `ast.test.ts`, `dispatch.test.ts`, `commands.test.ts`, `view-state.test.ts`, `html.test.ts`, `keys.test.ts`, `match-nav.test.ts`, `preprocess.test.ts`, `search.test.ts`, `toc-util.test.ts`, `overlay-rows.test.ts`. Mocks via `mock()` from `bun:test`. `commands.test.ts` builds `CommandDeps` via a `makeDeps({ state })` helper (`state` is a `Partial<ViewState>` overlaid on defaults) and asserts on the returned `actions.*` mock calls. `dispatch.test.ts` instead mocks the whole `Commands` object and asserts `dispatch` calls the right method. The imperative scroll seam is unit-tested through `scrollbox-handle.test.ts`, which drives `createScrollboxHandle` against a fake scrollbox; `commands.test.ts` covers the command layer against a fake `ScrollboxHandle`.
