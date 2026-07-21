import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { createElement } from 'react'
import { App } from '../App'
import { buildTree } from './ast'
import { buildDocument } from './loadDocument'
import { collectHitBearers, linkRanges, resolveLinkAtPoint } from './link-hit'
import type { HitBearer, LinkRange, Point } from './link-hit'
import { alignOffset, inlineText } from './visible-text'
import type { InlineNode, Node } from './ast'

const FIXTURE = readFileSync(join(import.meta.dir, '__fixtures__/links.md'), 'utf8')

// Block index paths in the fixture (marked's AST interleaves `space` nodes):
// 0 heading, 1 inline-link para, 3 wrapped-link para, 5 list, 7 table, 8 top/ext para.
const PARA_INLINE = 'blk-1'
const PARA_WRAP = 'blk-3'
const LIST_ITEM_BODY = 'blk-5-0-0'
const TABLE = 'blk-7'
const PARA_ANCHORS = 'blk-8'

type Renderable = { getChildren(): unknown[]; findDescendantById(id: string): unknown }

/**
 * Mount the real App headlessly at `width`, settle layout, and hand the caller
 * the live renderable root plus a captured char frame so a test can read a
 * link's real on-screen geometry and confirm it against rendered pixels.
 */
async function mountFixture(width: number) {
  const { nodes, toc, headingIds, headingLines } = buildDocument(FIXTURE)
  const { renderer, mockInput, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width,
    height: 40,
  })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  createRoot(renderer).render(
    createElement(App, {
      nodes,
      toc,
      headingIds,
      frontmatter: [],
      fileLabel: 'links.md',
      headingLines,
    }),
  )
  await settle()
  // First key is consumed by the terminal capability handshake; also nudges a frame.
  await mockInput.typeText('x')
  await settle()
  await settle()

  const root = renderer.root as unknown as Renderable
  return { root, frame: captureCharFrame().split('\n'), destroy: () => renderer.destroy(), nodes }
}

function visualLineForOffset(lineStartCols: number[], offset: number): number {
  let line = 0
  for (let i = 0; i < lineStartCols.length; i++) {
    if ((lineStartCols[i] ?? 0) <= offset) line = i
    else break
  }
  return line
}

/** Forward map: an inline-space offset -> its real screen point in a bearer. */
function pointForOffset(bearer: HitBearer, inline: InlineNode[], inlineOffset: number): Point {
  const rendered = alignOffset(inlineText(inline), bearer.plainText, inlineOffset)
  const line = visualLineForOffset(bearer.lineInfo.lineStartCols, rendered)
  const col = rendered - (bearer.lineInfo.lineStartCols[line] ?? 0)
  return { x: bearer.screenX + col, y: bearer.screenY + line }
}

function bearerContaining(root: Renderable, blockId: string, needle: string): HitBearer {
  const box = root.findDescendantById(blockId)
  if (!box) throw new Error(`block ${blockId} not mounted`)
  const bearers = collectHitBearers(box as { getChildren(): unknown[] }, [])
  const hit = bearers.find(b => b.plainText.includes(needle))
  if (!hit) throw new Error(`no bearer with "${needle}" under ${blockId}`)
  return hit
}

function blockBox(root: Renderable, blockId: string): { getChildren(): unknown[] } {
  const box = root.findDescendantById(blockId)
  if (!box) throw new Error(`block ${blockId} not mounted`)
  return box as { getChildren(): unknown[] }
}

function firstLink(inline: InlineNode[]): LinkRange {
  const [range] = linkRanges(inline)
  if (!range) throw new Error('inline has no link')
  return range
}

function paragraphInline(nodes: Node[], index: number): InlineNode[] {
  const node = nodes[index]
  if (node?.kind !== 'paragraph') throw new Error(`node ${index} is not a paragraph`)
  return node.inline
}

function listBodyInline(nodes: Node[], index: number): InlineNode[] {
  const node = nodes[index]
  if (node?.kind !== 'list') throw new Error(`node ${index} is not a list`)
  const body = node.items[0]?.children[0]
  if (body?.kind !== 'paragraph') throw new Error('list item body is not a paragraph')
  return body.inline
}

test('linkRanges maps link labels to inline-text offsets', () => {
  const { nodes } = buildTree(FIXTURE)
  const inline = paragraphInline(nodes, 1)
  const ranges = linkRanges(inline)
  expect(ranges).toHaveLength(1)
  const r = firstLink(inline)
  expect(r.href).toBe('https://one.example.com')
  expect(inlineText(inline).slice(r.start, r.end)).toBe('inline link')
})

test('linkRanges spans a label with nested inline formatting', () => {
  const { nodes } = buildTree('[see **bold** here](#x)\n')
  const inline = paragraphInline(nodes, 0)
  const range = firstLink(inline)
  expect(range.href).toBe('#x')
  expect(inlineText(inline).slice(range.start, range.end)).toBe('see bold here')
})

test('resolveLinkAtPoint: single-line inline link resolves; non-link char is null', async () => {
  const { root, frame, destroy, nodes } = await mountFixture(80)
  try {
    const inline = paragraphInline(nodes, 1)
    const bearer = bearerContaining(root, PARA_INLINE, 'inline link')
    const range = firstLink(inline)
    const mid = Math.floor((range.start + range.end) / 2)
    const point = pointForOffset(bearer, inline, mid)

    // Independent pixel check: the label really is rendered at that screen cell.
    expect(frame[point.y]?.[point.x]).toBe(inlineText(inline)[mid] ?? '')

    expect(resolveLinkAtPoint({ box: blockBox(root, PARA_INLINE), point, inline })).toBe(
      'https://one.example.com',
    )
    // First char of the paragraph ('A') is not inside any link.
    const outside = pointForOffset(bearer, inline, 0)
    expect(
      resolveLinkAtPoint({ box: blockBox(root, PARA_INLINE), point: outside, inline }),
    ).toBeNull()
  } finally {
    destroy()
  }
})

test('resolveLinkAtPoint: link label wrapped across visual lines resolves on every line', async () => {
  const { root, destroy, nodes } = await mountFixture(46)
  try {
    const inline = paragraphInline(nodes, 3)
    const bearer = bearerContaining(root, PARA_WRAP, 'label is deliberately')
    const range = firstLink(inline)

    // Collect the distinct visual lines the link label spans.
    const rows = new Set<number>()
    for (let o = range.start; o < range.end; o++) rows.add(pointForOffset(bearer, inline, o).y)
    expect(rows.size).toBeGreaterThanOrEqual(2)

    for (let o = range.start; o < range.end; o++) {
      const point = pointForOffset(bearer, inline, o)
      expect(resolveLinkAtPoint({ box: blockBox(root, PARA_WRAP), point, inline })).toBe(
        'https://wrap.example.com',
      )
    }
  } finally {
    destroy()
  }
})

test('resolveLinkAtPoint: link inside a list item resolves', async () => {
  const { root, destroy, nodes } = await mountFixture(80)
  try {
    const inline = listBodyInline(nodes, 5)
    const bearer = bearerContaining(root, LIST_ITEM_BODY, 'list target')
    const range = firstLink(inline)
    const mid = Math.floor((range.start + range.end) / 2)
    const point = pointForOffset(bearer, inline, mid)
    expect(resolveLinkAtPoint({ box: blockBox(root, LIST_ITEM_BODY), point, inline })).toBe(
      'https://list.example.com',
    )
  } finally {
    destroy()
  }
})

test('resolveLinkAtPoint: link inside a table cell resolves', async () => {
  const { root, destroy, nodes } = await mountFixture(80)
  try {
    const table = nodes[7]
    if (table?.kind !== 'table') throw new Error('node 7 is not a table')
    // Row 0, col 1 holds "see [cell link](...)".
    const inline = table.rows[0]?.[1] ?? []
    const bearer = bearerContaining(root, TABLE, 'cell link')
    const range = firstLink(inline)
    const mid = Math.floor((range.start + range.end) / 2)
    const point = pointForOffset(bearer, inline, mid)
    // box is the whole table (many cell bearers); geometry must pick the right one.
    expect(resolveLinkAtPoint({ box: blockBox(root, TABLE), point, inline })).toBe(
      'https://cell.example.com',
    )
  } finally {
    destroy()
  }
})

test('resolveLinkAtPoint: anchor and external links resolve distinctly', async () => {
  const { root, destroy, nodes } = await mountFixture(80)
  try {
    const inline = paragraphInline(nodes, 8)
    const bearer = bearerContaining(root, PARA_ANCHORS, 'top')
    const ranges = linkRanges(inline)
    expect(ranges.map(r => r.href)).toEqual(['#simple', 'https://example.com'])
    for (const range of ranges) {
      const mid = Math.floor((range.start + range.end) / 2)
      const point = pointForOffset(bearer, inline, mid)
      expect(resolveLinkAtPoint({ box: blockBox(root, PARA_ANCHORS), point, inline })).toBe(
        range.href,
      )
    }
  } finally {
    destroy()
  }
})
