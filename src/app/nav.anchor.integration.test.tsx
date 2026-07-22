import { test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { createElement } from 'react'
import { App } from './App'
import { loadDocument } from './lib/loadDocument'

type Renderable = { getChildren(): unknown[]; findDescendantById(id: string): unknown }

/**
 * Writes a source doc linking to `./tgt.md#usage` and a target whose `Usage`
 * heading sits `leadingSections` H2 sections down. A large `leadingSections`
 * pushes `Usage` past the initial mounted prefix so its box is committed but
 * unlaid-out (reads y=0) at pin time — the case that used to strand the reader
 * at the top of the target.
 *
 * Both docs open with the SAME H1 slug (`# App` → `app`), mirroring the real
 * repro (both viewmd docs start `# viewmd`). On the native renderer that
 * collision made the swap reuse the shared heading renderable with stale layout
 * (frozen y=0), hijacking the breadcrumb — fixed by keying the content subtree
 * on the doc path so each doc mounts fresh. NOTE: the headless test renderer
 * re-lays-out on `flush`, so it does not reproduce that stale-reconcile artifact;
 * this test guards the surrounding post-nav breadcrumb behavior, not the native
 * layout bug itself (verified by hand under a real terminal).
 */
function makeFixtures(leadingSections: number) {
  const dir = mkdtempSync(join(tmpdir(), 'viewmd-anchor-'))
  const src = join(dir, 'src.md')
  const tgt = join(dir, 'tgt.md')
  const filler = (n: number) =>
    Array.from({ length: n }, (_, i) => `Filler paragraph ${i} lorem ipsum dolor.`)
  const body: string[] = ['# App', '']
  for (let s = 0; s < leadingSections; s++) body.push(`## Lead ${s}`, '', ...filler(8), '')
  body.push('## Usage', '', 'This is the usage section body.', '', ...filler(8), '')
  // Pad with many trailing sections so the document is large enough that layout
  // is deferred across frames — the condition under which the anchor target is
  // committed but still reads y=0 at pin time.
  for (let s = 0; s < 40; s++) body.push(`## Trail ${s}`, '', ...filler(8), '')
  writeFileSync(src, '# App\n\nGo [deep](./tgt.md#usage) now.\n')
  writeFileSync(tgt, body.join('\n'))
  return { src }
}

function findCell(frame: string, needle: string): { x: number; y: number } {
  const lines = frame.split('\n')
  for (let y = 0; y < lines.length; y++) {
    const idx = lines[y]?.indexOf(needle) ?? -1
    if (idx >= 0) return { x: idx + 1, y }
  }
  throw new Error(`"${needle}" not found in frame`)
}

async function navigateToUsage(leadingSections: number) {
  const { src } = makeFixtures(leadingSections)
  const docSrc = await loadDocument(src)
  const harness = await createTestRenderer({ width: 80, height: 24 })
  const { renderer, mockInput, mockMouse, flush, renderOnce, captureCharFrame } = harness
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  createRoot(renderer).render(
    createElement(App, {
      nodes: docSrc.nodes,
      toc: docSrc.toc,
      headingIds: docSrc.headingIds,
      frontmatter: docSrc.frontmatter,
      fileLabel: docSrc.fileLabel,
      filePath: src,
      headingLines: docSrc.headingLines,
    }),
  )
  await settle()
  await mockInput.typeText('x') // consumed by the terminal capability handshake
  await settle()
  await settle()

  const link = findCell(captureCharFrame(), 'deep')
  await mockMouse.pressDown(link.x, link.y)
  await settle()
  await settle()
  await settle()
  return {
    renderer,
    mockInput,
    settle,
    captureCharFrame,
    root: renderer.root as unknown as Renderable,
  }
}

test('anchor nav lands in the target section (not stranded at top) and its breadcrumb sticks on scroll', async () => {
  const { renderer, mockInput, settle, captureCharFrame, root } = await navigateToUsage(1)

  expect(root.findDescendantById('usage')).toBeTruthy()
  const afterNav = captureCharFrame()
  // Landed in Usage, not stranded at the top: its body sits just below the
  // sticky overlay and the document's top content is off-screen. (The pin runs
  // post-layout; an effect-time pin would read the target's y as 0 and strand
  // the reader at row 0.)
  expect(afterNav).toContain('This is the usage section body.')
  // Usage is current (visible → filtered to the H1 pill); the previous sibling
  // must not leak in as a crumb (the back-badge + pin-gap off-by-one).
  expect(afterNav.split('\n').slice(0, 4).join('\n')).not.toContain('## Lead 0')

  // Scroll until Usage itself scrolls behind the overlay — its crumb must appear
  // and stick, proving the breadcrumb keeps updating after an anchored nav.
  for (let i = 0; i < 8; i++) await mockInput.typeText('j')
  await settle()
  await settle()
  expect(captureCharFrame().split('\n').slice(0, 4).join('\n')).toContain('## Usage')

  // Keep scrolling deep past Usage into the Trail sections. The breadcrumb must
  // track the section you're actually in — its crumb (`## Trail N`) present in
  // the overlay — rather than collapsing to just the H1 pill.
  for (let i = 0; i < 20; i++) await mockInput.typeText('j')
  await settle()
  await settle()
  const overlay = captureCharFrame().split('\n').slice(0, 5).join('\n')
  expect(overlay).toContain('## Trail')

  renderer.destroy()
})
