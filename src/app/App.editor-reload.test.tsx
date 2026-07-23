import { test, expect, beforeAll, afterAll } from 'bun:test'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { App } from './App'
import { buildTree } from './lib/ast'

// Editor reload must clear the active search (finding #2): after `e` reloads the
// document, stale search matches (pre-edit block ids/offsets) must not linger.
//
// This deliberately avoids `mock.module('./lib/editor', ...)`: bun's module
// mocking patches the process-wide module registry, and `bun test` loads every
// test file into one process — an ESM-bound consumer in another file (e.g.
// `lib/editor.test.ts`, which statically imports the same module) can end up
// permanently bound to the mocked exports regardless of when/whether this file
// later "restores" it. Instead, VIEWMD_EDITOR_COMMAND points at the real `true`
// binary: the real `resolveEditorCommand`/`buildEditorArgv`/`openInEditor` run
// unmocked, spawning a real but instant, harmless, no-tty-required process.
//
// Set/restore around the test rather than at module scope: `bun test` shares one
// process, so a module-scope mutation would persist and silently override the
// default-editor (`vi`/`$EDITOR`) behavior any later test relies on.
let prevEditorCmd: string | undefined
beforeAll(() => {
  prevEditorCmd = process.env.VIEWMD_EDITOR_COMMAND
  process.env.VIEWMD_EDITOR_COMMAND = 'true'
})
afterAll(() => {
  if (prevEditorCmd === undefined) delete process.env.VIEWMD_EDITOR_COMMAND
  else process.env.VIEWMD_EDITOR_COMMAND = prevEditorCmd
})

// 'zebra' lands in the visible viewport so a committed search produces exactly
// one active-highlight span, giving us an observable for "search still active."
const FIXTURE = ['# Title', '', 'zebra one', '', 'zebra two', ''].join('\n')

const ACTIVE_BG = { r: 245 / 255, g: 158 / 255, b: 31 / 255 }

test('editor reload clears the active search', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'viewmd-editor-reload-'))
  const filePath = join(dir, 'fixture.md')
  writeFileSync(filePath, FIXTURE)

  const { nodes, toc, headingIds } = buildTree(FIXTURE)
  const { renderer, mockInput, flush, renderOnce, captureSpans } = await createTestRenderer({
    width: 80,
    height: 20,
  })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  const settleUntil = async (pred: () => boolean, timeoutMs = 3000) => {
    const start = performance.now()
    do {
      await settle()
    } while (!pred() && performance.now() - start < timeoutMs)
  }

  const activeSpanCount = () => {
    const frame = captureSpans()
    const near = (v: number, t: number) => Math.abs(v - t) < 0.02
    let count = 0
    for (const line of frame.lines) {
      for (const s of line.spans ?? []) {
        if (near(s.bg.r, ACTIVE_BG.r) && near(s.bg.g, ACTIVE_BG.g) && near(s.bg.b, ACTIVE_BG.b)) {
          count++
        }
      }
    }
    return count
  }

  createRoot(renderer).render(
    <App
      nodes={nodes}
      toc={toc}
      headingIds={headingIds}
      frontmatter={[]}
      headingLines={{}}
      fileLabel="t/fixture.md"
      filePath={filePath}
    />,
  )
  await settle()
  // The very first key is consumed by the terminal capability handshake.
  await mockInput.typeText('x')
  await settle()

  await mockInput.typeText('/')
  await settle()
  await mockInput.typeText('zebra')
  await settle()
  mockInput.pressEnter()
  await settle()

  expect(activeSpanCount()).toBe(1)

  await mockInput.typeText('e')
  await settleUntil(() => activeSpanCount() === 0)

  expect(activeSpanCount()).toBe(0)

  renderer.destroy()
})
