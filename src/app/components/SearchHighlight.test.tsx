import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

const FIXTURE = [
  '# Title',
  '',
  'Click [linktext here](https://example.com) please.',
  '',
  '![zebra alt](https://example.com/x.png)',
  '',
  'zebra tail',
  '',
  '1. first item',
  '2. second item',
  '',
  '- [x] done task',
].join('\n')

const ACTIVE_BG = { r: 245 / 255, g: 158 / 255, b: 31 / 255 }
const MATCH_BG = { r: 245 / 255, g: 245 / 255, b: 67 / 255 }

async function setup() {
  return setupWith(FIXTURE, 80)
}

async function setupWith(fixture: string, width: number) {
  const { nodes, toc, headingIds } = buildTree(fixture)
  const { renderer, mockInput, flush, renderOnce, captureSpans } = await createTestRenderer({
    width,
    height: 24,
  })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  createRoot(renderer).render(
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/h.md" />,
  )
  await settle()
  // The very first key is consumed by the terminal capability handshake.
  await mockInput.typeText('x')
  await settle()
  return { renderer, mockInput, settle, captureSpans }
}

/** Rows of spans whose bg matches `target`, with the span text. */
function spansWithBg(
  captureSpans: Awaited<ReturnType<typeof createTestRenderer>>['captureSpans'],
  target: { r: number; g: number; b: number },
) {
  const out: { row: number; text: string }[] = []
  const frame = captureSpans()
  const near = (v: number, t: number) => Math.abs(v - t) < 0.02
  for (let row = 0; row < frame.lines.length; row++) {
    for (const s of frame.lines[row]?.spans ?? []) {
      if (near(s.bg.r, target.r) && near(s.bg.g, target.g) && near(s.bg.b, target.b)) {
        out.push({ row, text: s.text })
      }
    }
  }
  return out
}

test('a match spanning text→link renders one contiguous highlight', async () => {
  const { renderer, mockInput, settle, captureSpans } = await setup()

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('Click linktext')
  await settle()
  mockInput.pressEnter()
  await settle()

  const active = spansWithBg(captureSpans, ACTIVE_BG)
  expect(active.map(s => s.text).join('')).toBe('Click linktext')

  renderer.destroy()
})

test('image label furniture highlights', async () => {
  const { renderer, mockInput, settle, captureSpans } = await setup()

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('[Image: zebra')
  await settle()
  mockInput.pressEnter()
  await settle()

  const active = spansWithBg(captureSpans, ACTIVE_BG)
  expect(active.map(s => s.text).join('')).toBe('[Image: zebra')

  renderer.destroy()
})

test('non-active occurrences carry the plain match background', async () => {
  const { renderer, mockInput, settle, captureSpans } = await setup()

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  mockInput.pressEnter()
  await settle()

  // Two occurrences (image alt, trailing paragraph): one active, one plain.
  const active = spansWithBg(captureSpans, ACTIVE_BG)
  expect(active.map(s => s.text).join('')).toBe('zebra')
  const plain = spansWithBg(captureSpans, MATCH_BG)
  expect(plain.map(s => s.text).join('')).toBe('zebra')
  expect(plain[0]?.row).not.toBe(active[0]?.row)

  renderer.destroy()
})

test('a match spanning list marker and item text highlights both', async () => {
  const { renderer, mockInput, settle, captureSpans } = await setup()

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('1. first')
  await settle()
  mockInput.pressEnter()
  await settle()

  const active = spansWithBg(captureSpans, ACTIVE_BG)
  expect(active.map(s => s.text).join('')).toBe('1. first')

  renderer.destroy()
})

// Narrow renderer forces the cell to wrap; the range still lands on the right
// pieces because HighlightedText aligns wrapped chunks into the unwrapped cell text.
const WRAP_FIXTURE = [
  '# T',
  '',
  '| Col |',
  '| --- |',
  '| a wrapped zebra cell with many words forcing a wrap |',
].join('\n')

test('a match in a wrapped table cell highlights', async () => {
  const { renderer, mockInput, settle, captureSpans } = await setupWith(WRAP_FIXTURE, 40)

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra cell')
  await settle()
  mockInput.pressEnter()
  await settle()

  const active = spansWithBg(captureSpans, ACTIVE_BG)
  expect(active.map(s => s.text).join('')).toBe('zebra cell')

  renderer.destroy()
})

const HTML_FIXTURE = [
  '# T',
  '',
  '<p align="center">',
  '  <a href="https://example.com/build"><img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build" /></a>',
  '  <a href="https://example.com/npm"><img src="https://img.shields.io/npm/v/example" alt="npm" /></a>',
  '</p>',
].join('\n')

test('html block image alt highlights', async () => {
  const { renderer, mockInput, settle, captureSpans } = await setupWith(HTML_FIXTURE, 80)

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('Build')
  await settle()
  mockInput.pressEnter()
  await settle()

  const active = spansWithBg(captureSpans, ACTIVE_BG)
  expect(active.map(s => s.text).join('')).toBe('Build')

  renderer.destroy()
})

test('task checkbox marker highlights', async () => {
  const { renderer, mockInput, settle, captureSpans } = await setup()

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('[✓] done')
  await settle()
  mockInput.pressEnter()
  await settle()

  const active = spansWithBg(captureSpans, ACTIVE_BG)
  expect(active.map(s => s.text).join('')).toBe('[✓] done')

  renderer.destroy()
})
