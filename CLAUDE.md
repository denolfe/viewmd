# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## Commands

```bash
bun test                              # Run tests (uses bun:test — NOT vitest)
bun test --watch                      # Watch mode
bun test src/app/lib/ast.test.ts      # Single test file
bun run typecheck                     # tsc --noEmit

./src/index.tsx README.md            # Run CLI (interactive — requires a TTY)
./src/index.tsx --render README.md   # One-shot ANSI render to stdout
```

`viewmd` auto-renders a one-shot ANSI dump when stdout is not a TTY (pipe / fzf preview). Use `--render`/`-r` to force render mode in a TTY. The interactive viewer still requires a TTY.

## Architecture

Interactive terminal markdown viewer built on **OpenTUI** (`@opentui/core` + `@opentui/react`). Markdown is parsed once into a typed AST, rendered as React components inside a scrollable viewport with a TOC sidebar, sticky breadcrumb header, and status line.

**Full architecture: see [ARCHITECTURE.md](./ARCHITECTURE.md).** Read it before non-trivial changes touching the AST, dispatcher, viewer scroll surface, or sticky-header rules.

Quick orientation:

- Entry: `src/index.tsx` → `preprocess` → `buildTree` (AST + TOC + headingIds) → `createRoot(renderer).render(<App />)`.
- `App` (`src/app/App.tsx`) owns all reactive state via `AppStateContext`; imperative scroll goes through a `ScrollboxHandle` on `viewerRef`.
- Keyboard: `useKeyboard` → `mapKey` (pure, `src/app/lib/keys.ts`) → `dispatch` (effectful, `src/app/lib/dispatch.ts`).
- Heading boxes carry `id={node.id}`; `Viewer` resolves them via `box.content.findDescendantById(id)` for scroll/visibility logic.

## Testing features

The `mapKey → Action → dispatch` split is the testable seam — lean on it for any new
keyboard-driven feature:

- **`mapKey` (`keys.ts`) is pure** — assert `mapKey(k({ name: 'x' }), focus)` returns the
  expected `Action`. Use the existing `k()` helper in `keys.test.ts`. One test per focus the
  key is bound in.
- **`dispatch` (`dispatch.ts`) is effectful but unit-testable** — drive it with the
  `makeState` (mock `AppState`) and `makeViewerRef` helpers in `dispatch.test.ts`. Assert on
  the mocked setters / recorded scroll calls. `makeState` casts `as AppState`, so adding a new
  `AppState` field doesn't break existing tests — add a default there when you extend the type.
- **Layout / interactive behavior needs a TTY** — it can't be unit-tested. Verify by hand with
  `./src/index.tsx README.md` (interactive) or `./src/index.tsx --render README.md` (one-shot).

## Conventions

- Tests use `bun:test` (not vitest, not jest). Mocks via `mock()` from `bun:test`.
- Functions top-down: exports before helpers.
- `import type` separated from value imports, even from the same module.
- Avoid type assertions / non-null `!`; fix at the source.
- No fossil comments. No comments describing what removed code used to do.
- Conventional Commits. First commit on a branch carries the scope; subsequent commits prefer `chore` (squashed).

## Releasing

```bash
bun run release 0.1.0-beta.2   # version without a leading `v`
```

`scripts/release.ts` cuts a release from the current branch:

1. Guards: version arg present (no leading `v`), clean working tree, tag `v<version>` doesn't already exist.
2. Bumps `version` in `package.json`.
3. Builds a changelog of commits since the last tag (`git log <lastTag>..HEAD --no-merges`).
4. Commits `chore(release): v<version>` with the changelog as the body.
5. Creates annotated tag `v<version>` whose message is `v<version>` + the changelog.
6. `git push --follow-tags`.

The tag push triggers `.github/workflows/release.yml`, which builds binaries, publishes to npm (prerelease → `beta` dist-tag), and creates the GitHub Release. The release body is the tag's changelog: the `github-release` job extracts `%(contents:body)` from the tag into `NOTES.md` and passes it as `body_path`. So the changelog surfaces in the GitHub Release **only because CI reads it off the tag** — annotated tag messages are not auto-used by the release API.

## Ubiquitous Language

| Term             | Definition                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Viewer           | The scrollable content area (`<scrollbox>`)                                                 |
| Viewport         | The currently visible region of the Viewer (`box.viewport.{y,height}`)                      |
| TOC              | Table-of-contents sidebar; collapsible tree of `TocEntry`                                   |
| Current heading  | `currentHeadingId` — heading at/just-above viewport top, or last-jumped-to                  |
| Visible headings | `visibleHeadingIds` — set of heading ids whose box intersects the viewport                  |
| Breadcrumb       | Ancestor chain of `currentHeadingId`, rendered in `StickyHeader`                            |
| Synth root       | Filename label substituted as the first breadcrumb when the doc has no H1                   |
| Crumb            | One row in the breadcrumb; `{ id, inline, indent }`. Hidden while `id ∈ visibleHeadingIds`. |
| Focus            | `'viewer' \| 'sidebar' \| 'search'` — drives key dispatch                                   |
| Scrollbox tail   | Empty `<box height={tailSpace}>` after content so the last heading can scroll to top        |
