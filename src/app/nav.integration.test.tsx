import { test, expect } from 'bun:test'
import { join } from 'node:path'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { createElement } from 'react'
import { App } from './App'
import { buildDocument, loadDocument } from './lib/loadDocument'
import { classifyHref } from './lib/links'
import { collectHitBearers, linkRanges } from './lib/link-hit'
import type { HitBearer, LinkRange, Point } from './lib/link-hit'
import { alignOffset, inlineText } from './lib/visible-text'
import type { InlineNode, Node } from './lib/ast'
import type { LoadedDocument } from './lib/loadDocument'

const NAV_DIR = join(import.meta.dir, 'lib/__fixtures__/nav')
const A_PATH = join(NAV_DIR, 'a.md')

const PARA_B_LINK = 'blk-1'
const PARA_EXTERNAL = 'blk-3'

type Renderable = { getChildren(): unknown[]; findDescendantById(id: string): unknown }

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

function firstLink(inline: InlineNode[]): LinkRange {
  const [range] = linkRanges(inline)
  if (!range) throw new Error('inline has no link')
  return range
}

function nthLink(inline: InlineNode[], n: number): LinkRange {
  const range = linkRanges(inline)[n]
  if (!range) throw new Error(`inline has no link at index ${n}`)
  return range
}

function paragraphInline(nodes: Node[], index: number): InlineNode[] {
  const node = nodes[index]
  if (node?.kind !== 'paragraph') throw new Error(`node ${index} is not a paragraph`)
  return node.inline
}

/** Screen point for the middle char of a link within a rendered paragraph block. */
function pointForLink(params: {
  root: Renderable
  nodes: Node[]
  paraIndex: number
  blockId: string
  needle: string
  linkIndex?: number
}): Point {
  const { root, nodes, paraIndex, blockId, needle, linkIndex = 0 } = params
  const inline = paragraphInline(nodes, paraIndex)
  const bearer = bearerContaining(root, blockId, needle)
  const range = linkIndex === 0 ? firstLink(inline) : nthLink(inline, linkIndex)
  const mid = Math.floor((range.start + range.end) / 2)
  return pointForOffset(bearer, inline, mid)
}

/** Locates the on-screen cell of the ` ‹ Back ` badge's "Back" substring. */
function backBadgePoint(frame: string[]): Point {
  for (let y = 0; y < frame.length; y++) {
    const x = frame[y]?.indexOf('Back') ?? -1
    if (x >= 0) return { x, y }
  }
  throw new Error('back badge not found in frame')
}

async function mountA() {
  const docA: LoadedDocument = await loadDocument(A_PATH)
  expect(docA.dir).toBe(NAV_DIR)

  const { renderer, mockInput, mockMouse, flush, renderOnce, captureCharFrame } =
    await createTestRenderer({ width: 80, height: 40 })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }

  createRoot(renderer).render(
    createElement(App, {
      nodes: docA.nodes,
      toc: docA.toc,
      headingIds: docA.headingIds,
      frontmatter: docA.frontmatter,
      fileLabel: docA.fileLabel,
      filePath: A_PATH,
      headingLines: docA.headingLines,
    }),
  )
  await settle()
  // First key is consumed by the terminal capability handshake; also nudges a frame.
  await mockInput.typeText('x')
  await settle()
  await settle()

  const root = renderer.root as unknown as Renderable
  return { renderer, mockInput, mockMouse, settle, captureCharFrame, root, nodes: docA.nodes }
}

test('click ./b.md navigates to B; Backspace restores A', async () => {
  const { renderer, mockInput, mockMouse, settle, captureCharFrame, root, nodes } = await mountA()

  expect(root.findDescendantById('document-alpha')).toBeTruthy()

  const point = pointForLink({ root, nodes, paraIndex: 1, blockId: PARA_B_LINK, needle: 'to B' })
  await mockMouse.pressDown(point.x, point.y)
  await settle()
  await settle()

  expect(root.findDescendantById('document-bravo')).toBeTruthy()
  expect(root.findDescendantById('document-alpha')).toBeFalsy()
  expect(captureCharFrame()).toContain('Document Bravo')
  // The back affordance appears once history is non-empty.
  expect(captureCharFrame()).toContain('Back')

  mockInput.pressBackspace()
  await settle()
  await settle()

  expect(root.findDescendantById('document-alpha')).toBeTruthy()
  expect(root.findDescendantById('document-bravo')).toBeFalsy()
  expect(captureCharFrame()).toContain('Document Alpha')

  renderer.destroy()
})

test('click ./b.md navigates to B; clicking the ‹ Back badge restores A', async () => {
  const { renderer, mockMouse, settle, captureCharFrame, root, nodes } = await mountA()

  const point = pointForLink({ root, nodes, paraIndex: 1, blockId: PARA_B_LINK, needle: 'to B' })
  await mockMouse.pressDown(point.x, point.y)
  await settle()
  await settle()

  expect(root.findDescendantById('document-bravo')).toBeTruthy()

  const back = backBadgePoint(captureCharFrame().split('\n'))
  await mockMouse.pressDown(back.x, back.y)
  await settle()
  await settle()

  expect(root.findDescendantById('document-alpha')).toBeTruthy()
  expect(root.findDescendantById('document-bravo')).toBeFalsy()
  expect(captureCharFrame()).toContain('Document Alpha')

  renderer.destroy()
})

test('clicking an external https link does not swap the document', async () => {
  const { renderer, mockMouse, settle, captureCharFrame, root, nodes } = await mountA()

  const point = pointForLink({
    root,
    nodes,
    paraIndex: 3,
    blockId: PARA_EXTERNAL,
    needle: 'the site',
  })
  await mockMouse.pressDown(point.x, point.y)
  await settle()
  await settle()

  expect(root.findDescendantById('document-alpha')).toBeTruthy()
  expect(root.findDescendantById('document-bravo')).toBeFalsy()
  expect(captureCharFrame()).toContain('Document Alpha')
  // No navigation happened, so no back affordance.
  expect(captureCharFrame()).not.toContain('Back')

  renderer.destroy()
})

test('stdin doc (no baseDir) ignores relative .md links; anchors still classify', () => {
  const doc = buildDocument('# X\n\n[to B](./b.md) and [top](#x)\n')
  expect(doc.dir).toBeUndefined()
  expect(classifyHref({ baseDir: doc.dir, href: './b.md' }).kind).toBe('ignore')
  expect(classifyHref({ baseDir: doc.dir, href: '#x' })).toEqual({ kind: 'anchor', id: 'x' })
})
