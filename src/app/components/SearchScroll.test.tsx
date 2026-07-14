import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from '../App'
import { buildTree } from '../lib/ast'

// 'zebra' is visible in the initial viewport (under ## Middle, mid-screen);
// 'quokka' sits far below the fold. Filler avoids both needles.
const FIXTURE = [
  '# Title',
  '',
  ...Array.from({ length: 4 }, (_, i) => [`intro ${i}`, '']).flat(),
  '## Middle',
  '',
  'zebra two',
  '',
  ...Array.from({ length: 40 }, (_, i) => `filler ${i}`),
  '',
  '## End',
  '',
  'quokka three',
].join('\n')

async function setup() {
  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, mockInput, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 80,
    height: 20,
  })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  createRoot(renderer).render(
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/fix.md" />,
  )
  await settle()
  // The very first key is consumed by the terminal capability handshake.
  await mockInput.typeText('x')
  await settle()
  return { renderer, mockInput, settle, captureCharFrame }
}

function rowOf(frame: string, needle: string): number {
  // Skip row 0: the search overlay echoes the pattern there, and its trailing
  // bg spaces can complete a `needle ` match (e.g. pattern 'filler 12').
  return frame.split('\n').findIndex((l, i) => i > 0 && l.includes(needle))
}

// Row where a jumped-to match lands: JUMP_CONTEXT_ROWS (5) below the two-row
// breadcrumb overlay ('# Title' pill + the H2's own crumb, offscreen above).
const JUMP_ROW = 7

test('committing a search on a visible match jumps it to the top of the view', async () => {
  const { renderer, mockInput, settle, captureCharFrame } = await setup()

  const before = captureCharFrame()
  expect(rowOf(before, 'zebra two')).toBeGreaterThan(JUMP_ROW)

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  mockInput.pressEnter()
  await settle()

  expect(rowOf(captureCharFrame(), 'zebra two')).toBe(JUMP_ROW)

  renderer.destroy()
})

test('searching while scrolled down seeds from the viewport top, not the first document match', async () => {
  const { renderer, mockInput, settle, captureCharFrame } = await setup()

  // Scroll until 'zebra two' is above the viewport and the filler page shows.
  for (let i = 0; i < 20; i++) await mockInput.typeText('j')
  await settle()
  const before = captureCharFrame()
  expect(rowOf(before, 'zebra two')).toBe(-1)
  // First filler line at/below the viewport top — the match the seed must pick.
  const topFiller = before
    .split('\n')
    .map(l => l.match(/filler 2\d/)?.[0])
    .find(Boolean)
  expect(topFiller).toBeDefined()

  // 'ler 2' also matches 'filler 2', which sits above the viewport — index-0
  // seeding would jump the view back up to it.
  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('ler 2')
  await settle()
  mockInput.pressEnter()
  await settle()

  const after = captureCharFrame()
  expect(rowOf(after, topFiller ?? '')).toBe(JUMP_ROW)
  expect(rowOf(after, 'zebra two')).toBe(-1)

  renderer.destroy()
})

test('a match below the fold jumps to the top of the view', async () => {
  const { renderer, mockInput, settle, captureCharFrame } = await setup()

  const before = captureCharFrame()
  // Index of the first filler line hidden below the fold.
  let firstHiddenFiller = -1
  for (let i = 0; i < 40; i++) {
    if (rowOf(before, `filler ${i} `) === -1) {
      firstHiddenFiller = i
      break
    }
  }
  expect(firstHiddenFiller).toBeGreaterThan(0)

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText(`filler ${firstHiddenFiller}`)
  await settle()
  mockInput.pressEnter()
  await settle()

  const after = captureCharFrame()
  expect(rowOf(after, `filler ${firstHiddenFiller} `)).toBe(JUMP_ROW)
  expect(rowOf(after, 'zebra two')).toBe(-1)

  renderer.destroy()
})

// Matches spread across a paragraph, plain code block, table cell, image alt,
// and a trailing paragraph — block types that render (or skip) highlights
// differently. Guards the per-block active-match scoping: a match in one block
// must never shift which occurrence is active in another.
const BLOCK_MIX = [
  '# Title',
  '',
  'zebra one',
  '',
  '```',
  'zebra code',
  '```',
  '',
  '| Col |',
  '| --- |',
  '| zebra cell |',
  '',
  '![zebra alt](https://example.com/x.png)',
  '',
  'zebra last',
].join('\n')

const ACTIVE_BG = { r: 245 / 255, g: 158 / 255, b: 31 / 255 }

test('active highlight tracks n across code blocks, tables, and image alts', async () => {
  const { nodes, toc, headingIds } = buildTree(BLOCK_MIX)
  const { renderer, mockInput, flush, renderOnce, captureSpans, captureCharFrame } =
    await createTestRenderer({
      width: 80,
      height: 24,
    })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  createRoot(renderer).render(
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/mix.md" />,
  )
  await settle()
  await mockInput.typeText('x')
  await settle()

  const activePositions = () => {
    const out: string[] = []
    const frame = captureSpans()
    for (let row = 0; row < frame.lines.length; row++) {
      let col = 0
      for (const s of frame.lines[row]?.spans ?? []) {
        const near = (v: number, t: number) => Math.abs(v - t) < 0.02
        if (near(s.bg.r, ACTIVE_BG.r) && near(s.bg.g, ACTIVE_BG.g) && near(s.bg.b, ACTIVE_BG.b)) {
          out.push(`${row}:${col}`)
        }
        col += s.width
      }
    }
    return out
  }

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  mockInput.pressEnter()
  await settle()

  // Each n jumps the next match to the top, so screen positions repeat;
  // identity is asserted by the text on the active highlight's row instead.
  const expectedRows = ['zebra one', 'zebra code', 'zebra cell', 'zebra alt', 'zebra last']
  for (const expected of expectedRows) {
    const active = activePositions()
    expect(active).toHaveLength(1)
    const row = Number(active[0]?.split(':')[0])
    expect(captureCharFrame().split('\n')[row]).toContain(expected)
    await mockInput.typeText('n')
    await settle()
  }

  renderer.destroy()
})

// Matches inside a syntax-highlighted (tree-sitter) code block must render
// search backgrounds on top of the styled text, tracking n like other blocks.
const TS_BLOCK_MIX = [
  '# Title',
  '',
  'zebra intro',
  '',
  '```ts',
  'const zebra = 1',
  '```',
  '',
  'zebra tail',
].join('\n')

const MATCH_BG = { r: 245 / 255, g: 245 / 255, b: 67 / 255 }

test('search matches highlight inside syntax-highlighted code blocks and track n', async () => {
  const { nodes, toc, headingIds } = buildTree(TS_BLOCK_MIX)
  const { renderer, mockInput, flush, renderOnce, captureSpans, captureCharFrame } =
    await createTestRenderer({
      width: 80,
      height: 24,
    })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 60))
    await renderOnce()
  }
  // Code-block match spans arrive via the async tree-sitter highlight pipeline
  // (see makeMatchChunkTransform); a fixed sleep races it on slow CI runners.
  // Poll until the condition holds, then let the assertions report failures.
  const settleUntil = async (pred: () => boolean, timeoutMs = 3000) => {
    const start = performance.now()
    do {
      await settle()
    } while (!pred() && performance.now() - start < timeoutMs)
  }
  createRoot(renderer).render(
    <App nodes={nodes} toc={toc} headingIds={headingIds} frontmatter={[]} fileLabel="t/ts.md" />,
  )
  await settle()
  await mockInput.typeText('x')
  await settle()

  // Rows of spans whose bg matches `target`, with the span text.
  const spansWithBg = (target: { r: number; g: number; b: number }) => {
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
  const rowText = (row: number) => captureCharFrame().split('\n')[row] ?? ''

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  mockInput.pressEnter()
  await settleUntil(() =>
    spansWithBg(MATCH_BG).some(s => rowText(s.row).includes('const zebra = 1')),
  )

  // Active on the intro paragraph; the code-block occurrence shows a plain match bg.
  let active = spansWithBg(ACTIVE_BG)
  expect(active).toHaveLength(1)
  expect(rowText(active[0]?.row ?? -1)).toContain('zebra intro')
  const codeMatch = spansWithBg(MATCH_BG).find(s => rowText(s.row).includes('const zebra = 1'))
  expect(codeMatch?.text).toBe('zebra')

  // n → active moves onto the code-block match.
  await mockInput.typeText('n')
  await settleUntil(() =>
    spansWithBg(ACTIVE_BG).some(s => rowText(s.row).includes('const zebra = 1')),
  )
  active = spansWithBg(ACTIVE_BG)
  expect(active).toHaveLength(1)
  expect(rowText(active[0]?.row ?? -1)).toContain('const zebra = 1')

  // n → active leaves the code block; its match falls back to the plain bg.
  await mockInput.typeText('n')
  await settleUntil(() =>
    spansWithBg(MATCH_BG).some(s => rowText(s.row).includes('const zebra = 1')),
  )
  active = spansWithBg(ACTIVE_BG)
  expect(active).toHaveLength(1)
  expect(rowText(active[0]?.row ?? -1)).toContain('zebra tail')
  expect(spansWithBg(MATCH_BG).some(s => rowText(s.row).includes('const zebra = 1'))).toBe(true)

  renderer.destroy()
})

test('typing a search does not scroll the viewer; Enter jumps', async () => {
  const { renderer, mockInput, settle, captureCharFrame } = await setup()

  expect(rowOf(captureCharFrame(), 'quokka three')).toBe(-1)

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('quokka')
  await settle()
  // Live matches exist, but an uncommitted search must not move the view.
  expect(rowOf(captureCharFrame(), 'quokka three')).toBe(-1)

  mockInput.pressEnter()
  await settle()
  expect(rowOf(captureCharFrame(), 'quokka three')).toBe(JUMP_ROW)

  renderer.destroy()
})

test('a far jump lands the match at the top of the view', async () => {
  const { renderer, mockInput, settle, captureCharFrame } = await setup()

  expect(rowOf(captureCharFrame(), 'quokka three')).toBe(-1)

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('quokka')
  await settle()
  mockInput.pressEnter()
  await settle()

  expect(rowOf(captureCharFrame(), 'quokka three')).toBe(JUMP_ROW)

  renderer.destroy()
})
