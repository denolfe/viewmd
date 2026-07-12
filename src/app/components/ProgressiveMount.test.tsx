import { expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'
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
  createRoot(setup.renderer).render(
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/f.md" />,
  )
  return { nodes, setup, settle }
}

test('first frame shows top content before the full doc mounts', async () => {
  const { setup, settle } = await mount(bigFixture())
  await settle()
  expect(setup.captureCharFrame()).toContain('Top Title')
})

test('after settling, the last node is reachable and mounted (spacer gone)', async () => {
  const { setup, settle } = await mount(bigFixture())
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
  await settle()
  await setup.mockInput.typeText('THE-FINAL-LINE')
  await settle()
  setup.mockInput.pressEnter()
  await settle()
  expect(setup.captureCharFrame()).toContain('THE-FINAL-LINE')
})

test('small docs mount fully on first render', async () => {
  const { nodes } = buildTree('# Small\n\njust one paragraph\n')
  expect(initialMountCount({ nodes, contentWidth: 78, viewportHeight: 20 })).toBe(nodes.length)
})
