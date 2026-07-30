# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## Commands

```bash
bun test                              # Run tests (uses bun:test — NOT vitest)
bun test --watch                      # Watch mode
bun test src/app/lib/ast.test.ts      # Single test file
bun run typecheck                     # tsc --noEmit

./src/index.tsx README.md                            # Run CLI (interactive — requires a TTY)
./src/index.tsx --render README.md                   # One-shot ANSI render to stdout
./src/index.tsx --render --max-lines 40 README.md    # cap one-shot output (auto via FZF_PREVIEW_LINES in fzf previews)

VIEWMD_CONFIG=/path/config.toml ./src/index.tsx --render README.md   # test with an explicit config
```

`viewmd` auto-renders a one-shot ANSI dump when stdout is not a TTY (pipe / fzf preview). Use `--render`/`-r` to force render mode in a TTY. The interactive viewer still requires a TTY.

## Architecture

Interactive terminal markdown viewer built on **OpenTUI** (`@opentui/core` + `@opentui/react`). Markdown is parsed once into a typed AST, rendered as React components inside a scrollable viewport with a TOC sidebar, sticky overlay header, and status line.

**Full architecture: see [ARCHITECTURE.md](./docs/ARCHITECTURE.md).** Read it before non-trivial changes touching the AST, dispatcher, viewer scroll surface, or sticky-header rules.

Quick orientation:

- Entry: `src/index.tsx` → `preprocess` → `buildTree` (AST + TOC + headingIds) → `createRoot(renderer).render(<App />)`.
- `App` (`src/app/App.tsx`) holds the shared view state in one `useViewState` store (`{ state, actions }`, `src/app/lib/view-state.ts`) plus a `useLatest` ref over it (`stateRef`); it assembles both into `AppState` for `AppStateContext`. Imperative scroll goes through a `ScrollboxHandle` on `viewerRef`.
- Keyboard: `useKeyboard` → `mapKey` (pure, `src/app/lib/keys.ts`) → `dispatch` (pure, `src/app/lib/dispatch.ts`) → `Commands` (effectful, built by `createCommands` in `src/app/lib/commands.ts`, which reads `stateRef.current.*` and writes via `actions.*`).
- Heading boxes carry `id={node.id}`; the scroll seam resolves them through the `BoxGeometry` port, which walks the renderable tree with `collectById` (`renderable-tree.ts`).
- Two modules project the `TocEntry` tree, and they share nothing but the type: `toc-util.ts` serves the TOC sidebar (flatten/expand/width), `overlay-rows.ts` serves the sticky overlay (`ancestorChain` → `ancestorRows`). `fold.ts` consumes the latter for its offsets, so shown rows and occluded rows can't drift apart.

## Testing features

The `mapKey → Action → dispatch → Commands` split is the testable seam — lean on it for any
new keyboard-driven feature:

- **`mapKey` (`keys.ts`) is pure** — assert `mapKey(k({ name: 'x' }), focus)` returns the
  expected `Action`. Use the existing `k()` helper in `keys.test.ts`. One test per focus the
  key is bound in.
- **`dispatch` (`dispatch.ts`) is a pure `Action → Commands` method-call map** — `dispatch.test.ts`
  drives it with a `makeCommands()` helper that returns a `Commands` object of `mock()` stubs, then
  asserts the right method was called with the right args.
- **`createCommands` (`commands.ts`) is where the effects live, and it's unit-testable** — drive
  it with the `makeDeps({ state, viewerRef, doc })` helper in `commands.test.ts`. `state` is a
  `Partial<ViewState>` overlaid on defaults; `makeDeps` returns `{ deps, actions }` where `actions`
  is a `ViewActions` of `mock()` stubs — assert on `actions.*` calls and on the recorded calls from
  the fake `ScrollboxHandle`.
- **Layout / interactive behavior can be tested headlessly** — `createTestRenderer` from
  `@opentui/core/testing` mounts the real `App` without a TTY: mock keyboard input, capture
  char frames, assert on rendered rows/columns. See `ScrollIndicators.test.tsx` for the
  pattern (settle helper: `flush` → short sleep → `renderOnce`). Quirks: the **first
  keypress is consumed** by the terminal capability handshake — send a throwaway key
  first; use `typeText`/`pressEnter`, and locate the scrollbar column by its thumb glyphs
  (`█▀▄`). Final visual polish still deserves a by-hand pass with
  `./src/index.tsx README.md` (interactive) or `./src/index.tsx --render README.md` (one-shot).
- **Entry-point / TTY wiring needs a real pty, not the headless harness** —
  `createTestRenderer` injects a fake stdin and mounts `App` directly, bypassing
  `src/index.tsx` (stdin/stdout mode selection, `/dev/tty` keyboard fallback). Test that
  layer by spawning the actual CLI under an `expect`-allocated pty; see
  `pipe-input.test.ts` (guard with `describe.skipIf` when `expect` is unavailable, and
  remember the throwaway first keypress).

## Conventions

- Tests use `bun:test` (not vitest, not jest). Mocks via `mock()` from `bun:test`.
- Functions top-down: exports before helpers.
- `import type` separated from value imports, even from the same module.
- Avoid type assertions / non-null `!`; fix at the source.
- No fossil comments. No comments describing what removed code used to do.
- Conventional Commits. First commit on a branch carries the scope; subsequent commits prefer `chore` (squashed).

## Releasing

`bun run release [beta|patch|minor|<version>]` (see `scripts/release.ts`) bumps the version, then commits, tags, and pushes from the current branch. `beta` (default) bumps the prerelease; `patch` finalizes the prerelease (or bumps patch if already stable); `minor` bumps the minor. The tag push triggers `.github/workflows/release.yml`, which builds binaries, publishes to npm, and creates the GitHub Release with auto-generated notes.

CI derives the npm dist-tag from the version string alone: a prerelease (hyphen) publishes under `beta`, otherwise `latest`. The two dist-tags are independent — publishing a beta never moves `latest`.

## Ubiquitous Language

### Document & navigation

| Term          | Definition                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Document      | `LoadedDocument` — one parsed file: `{ nodes, toc, headingIds, headingLines, frontmatter, fileLabel, absPath, dir }` |
| File label    | Display name of a Document (basename, or `<stdin>`); also feeds the Synth root                                       |
| Doc swap      | Replacing the active Document (link nav, back, reload). Contrast an **in-doc jump**, which only scrolls.             |
| Back stack    | `HistoryEntry[]` — `{ document, scrollTop, currentHeadingId }` per visited doc. `historyDepth` is its size.          |
| Nav intent    | `{ scroll, reset, seq }` emitted by `navReducer`; consumed once by `applyScrollIntent`. `seq` disambiguates repeats. |
| Scroll intent | Where a transition wants the Viewer positioned: top / anchor / restored `scrollTop`                                  |
| Doc reset     | `'full' \| 'searchOnly' \| 'none'` — how much App-local UI state a transition clears                                 |
| Link target   | Classified href (`classifyHref`): in-doc anchor, local doc, or external                                              |

### Viewer & scroll

| Term                | Definition                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Viewer              | The scrollable content area (`<scrollbox>`)                                                            |
| Viewport            | The currently visible region of the Viewer (`box.viewport.{y,height}`)                                 |
| Geometry            | `BoxGeometry` — the narrow structural port over the scrollbox that all pure scroll math reads          |
| Overlay             | The sticky region painted over the top of the Viewport (Trail row + Ancestor rows)                     |
| Fold                | Line `topOffset + PIN_TOP_OFFSET` below the viewport top that decides which heading is current         |
| Fold offset         | Rows the Overlay occludes for a given heading; `Fold.offsetFor` / `aboveOffsetFor`                     |
| Pin                 | A scroll that parks a heading at the Fold (`scrollChildToTop`, `pinHeadingPostLayout`)                 |
| Pending target      | Queued scroll (heading / top / match) retried each post-layout frame until reached; `pendingReducer`   |
| Swap reposition     | A Pending target flagged `isSwap`; resolving it fires `onRepositioned`, which drops the Cover          |
| Cover               | Opaque box masking the Viewer while a Doc swap repositions, so the reader never sees the top-then-jump |
| Progressive mount   | Mounting top-level nodes in chunks (`CHUNK_SIZE`) after a viewport-sized first paint                   |
| Scrollbox tail      | Empty `<box height={tailSpace}>` after content so the last heading can scroll to the Fold              |
| Tail reserve        | Fold offset withheld from the tail so the last heading pins correctly                                  |
| Real content height | `scrollHeight` minus the tail — the height used for scrollability and thumb-size math                  |
| Scroll marks        | Search matches resolved to document-space `y` and painted onto scrollbar track rows (`TrackCell`)      |

### Headings & overlay

| Term             | Definition                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TOC              | Table-of-contents sidebar; collapsible tree of `TocEntry`                                                                                                               |
| TOC cursor       | `tocCursorId` — the sidebar's selected row, independent of the Current heading                                                                                          |
| Current heading  | `currentHeadingId` — last heading at/above the Fold, or last-jumped-to                                                                                                  |
| Visible headings | `visibleHeadingIds` — heading ids whose box intersects the Viewport below the Fold offset                                                                               |
| Ancestor stack   | Ancestor chain of `currentHeadingId`, rendered in `StickyHeader` below the Trail row                                                                                    |
| Ancestor row     | One row of the stack; `{ id, variant: 'pill' \| 'muted', level?, inline }`. Hidden while `id ∈ visibleHeadingIds`.                                                      |
| Synth root       | File label substituted as the first Ancestor row when the doc has no H1                                                                                                 |
| Breadcrumb/Trail | The cross-document label chain (origin first, current doc last), one row atop the Overlay. **"Crumb" and "breadcrumb" only ever mean this** — never the Ancestor stack. |
| Crumb            | One segment of the Trail; `{ label, kind: 'current' \| 'back' \| 'past' \| 'ellipsis', index }`                                                                         |

### Search & text

| Term       | Definition                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Projection | `BlockProjection` — the document projected into exactly the text the renderer prints; single source of truth for search, highlighting, and match→row mapping |
| Run        | A keyed text stretch within a Projection, made of `Segment`s tagged with an element ordinal and `searchable`                                                 |
| Match      | A hit inside a Run: `{ blockPath, blockElementId, runKey, start, length }`                                                                                   |
| Committed  | `search.committed` — false while typing, true after Enter. Only a committed search may scroll the Viewer.                                                    |
| Bearer     | `TextBearer` — a text-bearing renderable inside a block box; the unit geometry and hit-testing walk                                                          |

### Surfaces & modes

| Term        | Definition                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------- |
| Focus       | `'viewer' \| 'sidebar' \| 'search'` — drives key dispatch                                    |
| Status line | Bottom row; `Status` is `idle` (badge + filename) / `info` / `error`                         |
| Help panel  | Keyboard-shortcut drawer built from `HINTS`; each `Hint` carries `probes` as drift guards    |
| Mouse mode  | `mouseEnabled` — flag toggled by `m`. Currently written by `view-state` and read by nothing. |
| Render mode | One-shot ANSI dump to stdout (`--render`, or auto when stdout is not a TTY)                  |
