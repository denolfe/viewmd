import { test, expect, mock } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from './App'
import { buildTree } from './lib/ast'
import { PILL_LEFT, PILL_RIGHT } from './lib/visible-text'

/**
 * Mounts the App headlessly with a stubbed clipboard and drags across one row of
 * body text. `SSH_TTY` forces the OSC 52 branch: the command branch would spawn
 * pbcopy and overwrite the real clipboard of whoever runs the suite.
 */
async function dragOverLine(params: { markdown: string; needle: string; span: number }) {
  const { nodes, toc, headingIds } = buildTree(params.markdown)
  const { renderer, mockMouse, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 80,
    height: 20,
  })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }

  const copyToClipboardOSC52 = mock((_text: string) => true)
  renderer.isOsc52Supported = () => true
  renderer.copyToClipboardOSC52 = copyToClipboardOSC52
  process.env.SSH_TTY = '/dev/pts/test'

  createRoot(renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={[]}
      headingLines={{}}
      fileLabel="t/fix.md"
    />,
  )
  await settle()

  const lines = captureCharFrame().split('\n')
  const row = lines.findIndex(line => line.includes(params.needle))
  const startX = lines[row]?.indexOf(params.needle) ?? -1
  expect(startX).toBeGreaterThan(-1)

  await mockMouse.drag(startX, row, startX + params.span, row)
  await settle()

  const frame = captureCharFrame()
  const copied = copyToClipboardOSC52.mock.calls[0]?.[0]

  delete process.env.SSH_TTY
  renderer.destroy()

  return { copied, frame, callCount: copyToClipboardOSC52.mock.calls.length }
}

test('a mouse drag copies the selected text and reports it', async () => {
  const { copied, frame, callCount } = await dragOverLine({
    markdown: ['# Title', '', 'alpha beta gamma delta', ''].join('\n'),
    needle: 'alpha beta gamma delta',
    span: 'alpha beta'.length,
  })

  expect(callCount).toBe(1)
  expect(copied).toContain('alpha beta')
  expect(frame).toContain('Copied')
})

test('a drag across inline code copies the code without its pill glyphs', async () => {
  const { copied } = await dragOverLine({
    markdown: ['# Title', '', 'run `bun test` now', ''].join('\n'),
    needle: 'run ',
    span: 'run  bun test  now'.length,
  })

  expect(copied).toContain('bun test')
  expect(copied).not.toContain(PILL_LEFT)
  expect(copied).not.toContain(PILL_RIGHT)
})
