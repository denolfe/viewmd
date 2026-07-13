import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

// 'zebra' appears twice, both visible in the initial viewport.
const FIXTURE = ['# Title', '', 'zebra one', '', 'zebra two'].join('\n')

const BAR_BG = { r: 45 / 255, g: 45 / 255, b: 45 / 255 } // theme.searchBarBg #2d2d2d (matches stickyBg)
const RED = { r: 241 / 255, g: 76 / 255, b: 76 / 255 } // theme.searchBarNoMatchBg #f14c4c
const MATCH_BG = { r: 245 / 255, g: 245 / 255, b: 67 / 255 } // theme.searchMatchBg #f5f543

async function setup() {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, mockInput, flush, renderOnce, captureCharFrame, captureSpans } =
    await createTestRenderer({ width: 60, height: 16 })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  createRoot(renderer).render(
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/bar.md" />,
  )
  await settle()
  // The very first key is consumed by the terminal capability handshake.
  await mockInput.typeText('x')
  await settle()
  return { renderer, mockInput, settle, captureCharFrame, captureSpans }
}

type Rgb = { r: number; g: number; b: number }

function rowHasBg(spans: { bg: Rgb }[], target: Rgb): boolean {
  const near = (v: number, t: number) => Math.abs(v - t) < 0.02
  return spans.some(s => near(s.bg.r, target.r) && near(s.bg.g, target.g) && near(s.bg.b, target.b))
}

function bottomRowHasBg(captureSpans: () => { lines: { spans?: { bg: Rgb }[] }[] }, target: Rgb) {
  const frame = captureSpans()
  return rowHasBg(frame.lines[frame.lines.length - 1]?.spans ?? [], target)
}

function anyRowHasBg(captureSpans: () => { lines: { spans?: { bg: Rgb }[] }[] }, target: Rgb) {
  return captureSpans().lines.some(line => rowHasBg(line.spans ?? [], target))
}

function bottomRow(captureCharFrame: () => string): string {
  // captureCharFrame() ends with a trailing newline, so a naive split's last
  // element is '' — the real last row is one before that.
  const rows = captureCharFrame().split('\n')
  return rows[rows.length - 2] ?? ''
}

test('idle: no bottom bar, no idle colon row', async () => {
  const { renderer, captureCharFrame, captureSpans } = await setup()
  expect(bottomRow(captureCharFrame)).not.toContain('search:')
  expect(bottomRow(captureCharFrame).trim()).not.toBe(':')
  expect(bottomRowHasBg(captureSpans, BAR_BG)).toBe(false)
  renderer.destroy()
})

test('/ opens the gray bar with the search: label', async () => {
  const { renderer, mockInput, settle, captureCharFrame, captureSpans } = await setup()
  await mockInput.typeText('/')
  await settle()
  expect(bottomRow(captureCharFrame)).toContain('search:')
  expect(bottomRowHasBg(captureSpans, BAR_BG)).toBe(true)
  renderer.destroy()
})

test('typing shows live counter and live highlights without committing', async () => {
  const { renderer, mockInput, settle, captureCharFrame, captureSpans } = await setup()
  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  // Live-seeded counter: nearest match is 'zebra one' (index 0) → 1 of 2.
  expect(bottomRow(captureCharFrame)).toContain('1 of 2')
  // Live highlights in the viewer while still typing.
  expect(anyRowHasBg(captureSpans, MATCH_BG)).toBe(true)
  renderer.destroy()
})

test('zero matches tints the whole bar red with 0 of 0', async () => {
  const { renderer, mockInput, settle, captureCharFrame, captureSpans } = await setup()
  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zzqqx')
  await settle()
  expect(bottomRow(captureCharFrame)).toContain('0 of 0')
  expect(bottomRowHasBg(captureSpans, RED)).toBe(true)
  expect(bottomRowHasBg(captureSpans, BAR_BG)).toBe(false)
  renderer.destroy()
})

test('bar persists after Enter with identical style and counter', async () => {
  const { renderer, mockInput, settle, captureCharFrame, captureSpans } = await setup()
  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  mockInput.pressEnter()
  await settle()
  expect(bottomRow(captureCharFrame)).toContain('search:')
  expect(bottomRow(captureCharFrame)).toContain('1 of 2')
  expect(bottomRowHasBg(captureSpans, BAR_BG)).toBe(true)
  // n advances the counter.
  await mockInput.typeText('n')
  await settle()
  expect(bottomRow(captureCharFrame)).toContain('2 of 2')
  renderer.destroy()
})

test('escape while typing dismisses the bar and highlights', async () => {
  const { renderer, mockInput, settle, captureCharFrame, captureSpans } = await setup()
  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  mockInput.pressEscape()
  await settle()
  expect(bottomRow(captureCharFrame)).not.toContain('search:')
  expect(bottomRowHasBg(captureSpans, BAR_BG)).toBe(false)
  expect(anyRowHasBg(captureSpans, MATCH_BG)).toBe(false)
  renderer.destroy()
})

test('? opens the bar with the backward direction hint', async () => {
  const { renderer, mockInput, settle, captureCharFrame } = await setup()
  await mockInput.typeText('?')
  await settle()
  expect(bottomRow(captureCharFrame)).toContain('search↑:')
  renderer.destroy()
})
