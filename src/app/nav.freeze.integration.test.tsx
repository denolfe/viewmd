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

  // Jump heading-by-heading to the last section, where the "to B" link lives. This
  // pins that heading near the top (link visible below) with a deep, non-zero scroll,
  // so restoring to 0 on Back would be a visible flash rather than a correct restore.
  for (let i = 0; i < 13; i++) {
    await mockInput.typeText('n')
    await settle()
  }

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

  // Clip to the viewer's columns (the TOC sidebar on the right legitimately shows
  // the incoming doc's title — that's not the viewer content flashing).
  const VIEWER_COLS = 58
  const flashes: string[] = []
  for (let k = 0; k < 10; k++) {
    await renderOnce()
    const frame = captureCharFrame()
    const top = frame
      .split('\n')
      .slice(0, 3)
      .map(line => line.slice(0, VIEWER_COLS))
      .join('\n')
    const scrollbox = findScrollbox(renderer as unknown as { root: Renderable })
    if (top.includes('Document Alpha') && scrollbox?.scrollTop === 0) {
      flashes.push(`frame ${k}`)
    }
    await new Promise(r => setTimeout(r, 1))
  }

  expect(flashes).toEqual([])

  renderer.destroy()
})
