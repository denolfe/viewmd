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
  const searchPromptShows = (pattern: string) => (frame: string) =>
    frame.split('\n').some(line => line.includes(`search: ${pattern}`))
  // The committed pattern also echoes in the search bar as `search: <pattern>
  // N of M` — only a line without the bar's label proves the body text mounted.
  const bodyLineShows = (text: string) => (frame: string) =>
    frame.split('\n').some(line => line.includes(text) && !line.includes(`search: ${text}`))
  createRoot(setup.renderer).render(
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/f.md" />,
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
