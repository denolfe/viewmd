import { test, expect } from 'bun:test'
import { join } from 'node:path'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { createElement } from 'react'
import { App } from './App'
import { loadDocument } from './lib/loadDocument'
import type { LoadedDocument } from './lib/loadDocument'

const NAV_DIR = join(import.meta.dir, 'lib/__fixtures__/nav')
const AA_PATH = join(NAV_DIR, 'aa.md')

type Renderable = { getChildren(): unknown[]; scrollTop?: number; content?: unknown }

/** Depth-first search for the scrollbox node (the one with a numeric scrollTop + content). */
function findScrollbox(renderer: { root: Renderable }): Renderable | null {
  let found: Renderable | null = null
  const walk = (node: Renderable) => {
    if (found) return
    if (typeof node.scrollTop === 'number' && node.content) {
      found = node
      return
    }
    for (const child of node.getChildren?.() ?? []) walk(child as Renderable)
  }
  walk(renderer.root)
  return found
}

async function mountAA() {
  const docAA: LoadedDocument = await loadDocument(AA_PATH)
  expect(docAA.dir).toBe(NAV_DIR)

  const { renderer, mockInput, mockMouse, flush, renderOnce, captureCharFrame } =
    await createTestRenderer({ width: 80, height: 40 })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }

  createRoot(renderer).render(
    createElement(App, {
      nodes: docAA.nodes,
      toc: docAA.toc,
      headingIds: docAA.headingIds,
      frontmatter: docAA.frontmatter,
      fileLabel: docAA.fileLabel,
      filePath: AA_PATH,
      headingLines: docAA.headingLines,
    }),
  )
  await settle()
  // First key is consumed by the terminal capability handshake; also nudges a frame.
  await mockInput.typeText('x')
  await settle()
  await settle()

  return { renderer, mockInput, mockMouse, settle, renderOnce, captureCharFrame }
}

test('Back to a tall document does not flash the incoming doc at scrollTop 0', async () => {
  const { renderer, mockInput, mockMouse, settle, renderOnce, captureCharFrame } = await mountAA()

  // Scroll A down away from the top so its "restored" position is non-zero.
  for (let i = 0; i < 6; i++) {
    await mockInput.typeText('n')
    await settle()
  }

  // Jump back to the very top so the "to B" link is on screen to click.
  await mockInput.typeText('g')
  await settle()

  const frameLines = captureCharFrame().split('\n')
  const linkRow = frameLines.findIndex(line => line.includes('to B'))
  expect(linkRow).toBeGreaterThanOrEqual(0)
  const linkCol = (frameLines[linkRow] ?? '').indexOf('to B')

  await mockMouse.pressDown(linkCol + 1, linkRow)
  await settle()
  await settle()

  expect(captureCharFrame()).toContain('Document Bravo')

  // Re-scroll A's memory isn't reset by navigating away; going Back should restore
  // A at its saved scroll position, not flash A's top before jumping there.
  mockInput.pressBackspace()

  const flashes: string[] = []
  for (let k = 0; k < 10; k++) {
    await renderOnce()
    const frame = captureCharFrame()
    const top = frame.split('\n').slice(0, 3).join('\n')
    const scrollbox = findScrollbox(renderer as unknown as { root: Renderable })
    if (top.includes('Document Alpha') && scrollbox?.scrollTop === 0) {
      flashes.push(`frame ${k}`)
    }
    await new Promise(r => setTimeout(r, 1))
  }

  expect(flashes).toEqual([])

  renderer.destroy()
})
