import { useState } from 'react'
import { expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { ScrollBoxRenderable } from '@opentui/core'
import type { Renderable } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { Viewer } from './Viewer'
import { AppStateContext } from '../state'
import type { AppState, ScrollboxHandle } from '../state'
import { buildTree } from '../lib/ast'
import { findMatches } from '../lib/search'
import { initialMountCount } from '../lib/progressive'
import type { Node } from '../lib/ast'

const bigFixture = (): string =>
  [
    '# Top Title',
    '',
    'first paragraph',
    '',
    ...Array.from({ length: 400 }, (_, i) => `filler paragraph ${i}\n`),
    '## Last Heading',
    '',
    'THE-FINAL-LINE',
  ].join('\n')

const mount = async (md: string) => {
  const { nodes, toc, headingIds } = buildTree(md)
  const setup = await createTestRenderer({ width: 80, height: 20 })
  const settle = async () => {
    await setup.flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await setup.renderOnce()
  }
  // Fixed-time settles race against React commits on slow CI runners (e.g.
  // typing the search pattern before the search <input> takes focus drops the
  // keys) — settle until the frame proves the condition instead.
  const settleUntil = async (isVisible: (frame: string) => boolean) => {
    for (let i = 0; i < 40; i++) {
      await settle()
      if (isVisible(setup.captureCharFrame())) return
    }
    throw new Error(`condition not met after 40 settles:\n${setup.captureCharFrame()}`)
  }
  // The search overlay renders on the top row of the frame.
  const searchPromptShows = (pattern: string) => (frame: string) =>
    (frame.split('\n')[0] ?? '').includes(`/${pattern}`)
  // The committed pattern also echoes in the top-row search overlay — only a
  // line below it proves the body text mounted.
  const bodyLineShows = (text: string) => (frame: string) =>
    frame.split('\n').some((line, i) => i > 0 && line.includes(text))
  createRoot(setup.renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={[]}
      headingLines={{}}
      fileLabel="t/f.md"
    />,
  )
  return { nodes, setup, settle, settleUntil, searchPromptShows, bodyLineShows }
}

test('first frame shows top content before the full doc mounts', async () => {
  const { setup, settle } = await mount(bigFixture())
  await settle()
  expect(setup.captureCharFrame()).toContain('Top Title')
})

test('after settling, the last node is reachable and mounted (spacer gone)', async () => {
  const { setup, settle, settleUntil, searchPromptShows, bodyLineShows } = await mount(bigFixture())
  // Let the growth loop finish: settle repeatedly until mounting stabilizes.
  for (let i = 0; i < 40; i++) await settle()
  // `G`/scrollToBottom overshoots into the synthetic tail spacer by design
  // (so the last heading can scroll to the very top) and doesn't reliably
  // land the final line on screen — jump via search instead, which lands
  // the viewport centered on the match and reliably proves the last node
  // (and everything before it) is mounted.
  await setup.mockInput.typeText('x') // handshake consumes first key
  await settle()
  await setup.mockInput.typeText('/')
  await settleUntil(searchPromptShows(''))
  await setup.mockInput.typeText('THE-FINAL-LINE')
  await settleUntil(searchPromptShows('THE-FINAL-LINE'))
  setup.mockInput.pressEnter()
  await settleUntil(bodyLineShows('THE-FINAL-LINE'))
  expect(bodyLineShows('THE-FINAL-LINE')(setup.captureCharFrame())).toBe(true)
})

test('small docs mount fully on first render', async () => {
  const { nodes } = buildTree('# Small\n\njust one paragraph\n')
  expect(initialMountCount({ nodes, contentWidth: 78, viewportHeight: 20 })).toBe(nodes.length)
})

test('large docs start partially mounted', () => {
  const { nodes } = buildTree(bigFixture())
  expect(initialMountCount({ nodes, contentWidth: 78, viewportHeight: 20 })).toBeLessThan(
    nodes.length,
  )
})

/**
 * Mounts Viewer alone under a minimal AppState so the test owns viewerRef and
 * can drive the ScrollboxHandle synchronously — deterministic, unlike keyboard
 * input whose settles let the growth loop finish before the jump is issued.
 */
const mountViewerOnly = async (md: string, onScroll?: () => void) => {
  const { nodes, headingIds } = buildTree(md)
  const setup = await createTestRenderer({ width: 80, height: 20 })
  const viewerRef: { current: ScrollboxHandle | null } = { current: null }
  const state = { viewerRef, contentWidth: 78, search: null } as AppState
  const settle = async () => {
    await setup.flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await setup.renderOnce()
  }
  createRoot(setup.renderer).render(
    <AppStateContext.Provider value={state}>
      <Viewer nodes={nodes} onScroll={onScroll} />
    </AppStateContext.Provider>,
  )
  // Wait for React to commit the mount effect that installs the handle. Each
  // event-loop tick advances at most one 32-node chunk; the fixture needs ~25
  // chunks, so the tail of the doc is still safely unmounted afterwards.
  for (let i = 0; i < 50 && !viewerRef.current; i++) {
    await new Promise(r => setTimeout(r, 1))
    await setup.renderOnce()
  }
  if (!viewerRef.current) throw new Error('viewer handle never installed')
  return { nodes, headingIds, setup, settle, viewerRef }
}

/** The raw scrollbox renderable — lets a test scroll like the mouse wheel does, bypassing the handle. */
const findScrollbox = (node: Renderable): ScrollBoxRenderable | null => {
  if (node instanceof ScrollBoxRenderable) return node
  for (const child of node.getChildren()) {
    const found = findScrollbox(child)
    if (found) return found
  }
  return null
}

test('scrollChildToTop to an unmounted heading completes once its chunk mounts', async () => {
  const { headingIds, setup, settle, viewerRef } = await mountViewerOnly(bigFixture())
  const lastId = headingIds.at(-1)
  if (lastId === undefined) throw new Error('fixture must have headings')
  // Only the initial chunk is mounted here — the last heading isn't in the tree yet.
  viewerRef.current?.scrollChildToTop(lastId)
  for (let i = 0; i < 40; i++) await settle()
  expect(setup.captureCharFrame()).toContain('Last Heading')
})

test('jumpToMatch to an unmounted block completes once its chunk mounts', async () => {
  let scrolls = 0
  const { nodes, setup, settle, viewerRef } = await mountViewerOnly(bigFixture(), () => {
    scrolls++
  })
  const matches = findMatches(nodes, 'THE-FINAL-LINE')
  const match = matches[0]
  if (!match) throw new Error('fixture must contain the search target')
  // The match's block is still behind the spacer — jumpToMatch must record it.
  viewerRef.current?.jumpToMatch({ match, matches, index: 0 })
  for (let i = 0; i < 40; i++) await settle()
  expect(setup.captureCharFrame()).toContain('THE-FINAL-LINE')
  // Mount completion + the completed jump must have fired the scroll listeners.
  expect(scrolls).toBeGreaterThan(0)
})

test('a direct scroll while a jump is pending supersedes the pending jump', async () => {
  const { headingIds, setup, settle, viewerRef } = await mountViewerOnly(bigFixture())
  const lastId = headingIds.at(-1)
  if (lastId === undefined) throw new Error('fixture must have headings')
  viewerRef.current?.scrollChildToTop(lastId) // miss → pending recorded
  const box = findScrollbox(setup.renderer.root)
  if (!box) throw new Error('scrollbox not found')
  // Wheel/drag mutate the scrollbox directly without going through the
  // handle — this must cancel the pending jump, not get yanked away later.
  box.scrollBy(4)
  for (let i = 0; i < 40; i++) await settle()
  const frame = setup.captureCharFrame()
  expect(frame).toContain('filler paragraph')
  expect(frame).not.toContain('Last Heading')
})

/**
 * Wraps Viewer in its own `nodes` state and exposes the setter via
 * `controller.current` — swapping via this setter re-renders the SAME
 * `Viewer` fiber with new props (the real follow-link/go-back scenario:
 * `App`'s state changes, `Viewer` itself never remounts). Calling
 * `root.render(...)` a second time does NOT reproduce this: `createRoot`
 * builds a brand-new reconciler container per call, so a second `render`
 * mounts a second, independent tree rather than updating the first.
 */
function DocHost({
  initial,
  state,
  controller,
}: {
  initial: Node[]
  state: AppState
  controller: { current: ((nodes: Node[]) => void) | null }
}) {
  const [nodes, setNodes] = useState(initial)
  controller.current = setNodes
  return (
    <AppStateContext.Provider value={state}>
      <Viewer nodes={nodes} />
    </AppStateContext.Provider>
  )
}

test('swapping to a longer doc re-expands the initial mounted prefix', async () => {
  const { nodes: shortNodes } = buildTree('# Small\n\njust one paragraph\n')
  const { nodes: longNodes } = buildTree(bigFixture())
  const setup = await createTestRenderer({ width: 80, height: 20 })
  const viewerRef: { current: ScrollboxHandle | null } = { current: null }
  const state = { viewerRef, contentWidth: 78, search: null } as AppState
  const controller: { current: ((nodes: Node[]) => void) | null } = { current: null }

  createRoot(setup.renderer).render(
    <DocHost initial={shortNodes} state={state} controller={controller} />,
  )
  // Settle fully so the short doc (which fully mounts in one pass) is stable
  // before the swap — the real follow-link scenario navigates from a
  // steady-state document, not one mid-mount.
  await setup.flush({ maxPasses: 20 })
  await new Promise(r => setTimeout(r, 30))
  await setup.renderOnce()

  // Swap to the long doc on the SAME Viewer instance (no key change, same
  // fiber) via the host's own state setter — exactly the follow-link/go-back
  // path: `mountedCount` is preserved across the swap unless Viewer itself
  // resets it.
  if (!controller.current) throw new Error('DocHost setter never installed')
  controller.current(longNodes)

  // Capture the FIRST commit after the swap without letting the growth
  // effect's own setTimeout(0) tick fire. React's concurrent-mode commit for
  // an update outside an event handler needs one real macrotask to flush —
  // a single `setTimeout(0)` round-trip lets exactly that happen. Any NEW
  // timer the just-committed render's growth effect schedules is queued
  // during that same timer-phase pass, so it can't also fire within this
  // same tick (Node defers it to the next loop iteration) — it won't grow
  // the stale count and mask the bug before we capture.
  await new Promise(r => setTimeout(r, 0))
  await setup.renderOnce()

  // `filler paragraph 0` is the third node of the long doc, immediately
  // after `Top Title` / `first paragraph` — well within the first-page
  // viewport. Pre-fix, only the stale short-doc prefix (2 nodes) mounts on
  // this first commit, so it's absent. Post-fix, the reset re-expands the
  // prefix to the long doc's own initialMountCount (~39 nodes here), so it's
  // present.
  expect(setup.captureCharFrame()).toContain('filler paragraph 0')
})

test('search jump issued before mount completes lands once the target mounts', async () => {
  const { setup, settle, settleUntil, searchPromptShows, bodyLineShows } = await mount(bigFixture())
  // Search right away, while the growth loop is still running: the commit
  // fires with the last block (the match target) not yet mounted, so
  // jumpToMatch misses and must record a pending target that completes once
  // the chunk containing it lands. (Typing + settling advances only a few of
  // the ~25 chunks this fixture needs, so the target is reliably unmounted
  // at commit time; without the pending path the jump silently no-ops.)
  await settle()
  await setup.mockInput.typeText('x') // handshake consumes first key
  await settle()
  await setup.mockInput.typeText('/')
  await settleUntil(searchPromptShows(''))
  await setup.mockInput.typeText('THE-FINAL-LINE')
  await settleUntil(searchPromptShows('THE-FINAL-LINE'))
  setup.mockInput.pressEnter()
  await settleUntil(bodyLineShows('THE-FINAL-LINE'))
  expect(bodyLineShows('THE-FINAL-LINE')(setup.captureCharFrame())).toBe(true)
})
