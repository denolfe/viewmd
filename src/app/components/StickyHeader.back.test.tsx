import { test, expect, mock } from 'bun:test'
import { createTestRenderer, createMockMouse, MouseButtons } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { StickyHeader } from './StickyHeader'
import { AppStateContext } from '../state'
import type { AppState } from '../state'
import { createNoopCommands } from '../lib/commands'

function makeStub(overrides: Partial<AppState> = {}): AppState {
  return {
    focus: 'viewer',
    currentHeadingId: null,
    // Unused by StickyHeader; provided so the context object type-checks.
    viewerRef: { current: null },
    expanded: new Map(),
    tocCursorId: null,
    search: null,
    visibleHeadingIds: new Set<string>(),
    contentWidth: 80,
    dir: undefined,
    // Real Commands surface with an assertable goToDocument for the trail click tests.
    commands: { ...createNoopCommands(), goToDocument: mock() },
    historyDepth: 0,
    trailLabels: [],
    contentMaxWidth: 80,
    status: { kind: 'idle' },
    ...overrides,
  }
}

async function renderHeader(stub: AppState) {
  const { renderer, flush, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 80,
    height: 20,
  })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 30))
    await renderOnce()
  }
  createRoot(renderer).render(
    <AppStateContext.Provider value={stub}>
      <StickyHeader toc={[]} onCrumbClick={mock()} />
    </AppStateContext.Provider>,
  )
  await settle()
  return { renderer, settle, captureCharFrame }
}

test('clicking the immediate-previous crumb navigates to its document', async () => {
  const stub = makeStub({ historyDepth: 1, trailLabels: ['README.md', 'docs/guide.md'] })
  const { renderer, settle, captureCharFrame } = await renderHeader(stub)
  const mouse = createMockMouse(renderer)

  const frame = captureCharFrame()
  expect(frame).toContain('README.md')
  expect(frame).toContain('docs/guide.md')

  const lines = frame.split('\n')
  const row = lines.findIndex(l => l.includes('README.md'))
  expect(row).toBeGreaterThanOrEqual(0)
  const col = (lines[row] ?? '').indexOf('README.md')

  await mouse.click(col, row, MouseButtons.LEFT)
  await settle()

  // README is trail index 0 (the previous doc); the current doc is index 1.
  expect(stub.commands.goToDocument).toHaveBeenCalledWith(0)

  renderer.destroy()
})

test('trail shows the whole chain joined by chevrons', async () => {
  const stub = makeStub({
    historyDepth: 3,
    trailLabels: ['a.md', 'b.md', 'nav/reference.md', 'api.md'],
  })
  const { renderer, captureCharFrame } = await renderHeader(stub)

  const frame = captureCharFrame()
  expect(frame).toContain('a.md')
  expect(frame).toContain('›')
  expect(frame).toContain('api.md')

  renderer.destroy()
})

test('clicking an older crumb navigates straight to that document', async () => {
  const stub = makeStub({
    historyDepth: 3,
    trailLabels: ['origin.md', 'mid.md', 'prev.md', 'current.md'],
  })
  const { renderer, settle, captureCharFrame } = await renderHeader(stub)
  const mouse = createMockMouse(renderer)

  const lines = captureCharFrame().split('\n')
  const row = lines.findIndex(l => l.includes('origin.md'))
  const col = (lines[row] ?? '').indexOf('origin.md')

  await mouse.click(col, row, MouseButtons.LEFT)
  await settle()

  // origin.md is the first crumb (trail index 0).
  expect(stub.commands.goToDocument).toHaveBeenCalledWith(0)

  renderer.destroy()
})

test('right-click on a crumb does not navigate', async () => {
  const stub = makeStub({ historyDepth: 1, trailLabels: ['README.md', 'docs/guide.md'] })
  const { renderer, settle, captureCharFrame } = await renderHeader(stub)
  const mouse = createMockMouse(renderer)

  const lines = captureCharFrame().split('\n')
  const row = lines.findIndex(l => l.includes('README.md'))
  const col = (lines[row] ?? '').indexOf('README.md')

  await mouse.click(col, row, MouseButtons.RIGHT)
  await settle()

  expect(stub.commands.goToDocument).not.toHaveBeenCalled()

  renderer.destroy()
})

test('clicking the current-doc crumb does not navigate', async () => {
  const stub = makeStub({ historyDepth: 1, trailLabels: ['README.md', 'docs/guide.md'] })
  const { renderer, settle, captureCharFrame } = await renderHeader(stub)
  const mouse = createMockMouse(renderer)

  const lines = captureCharFrame().split('\n')
  const row = lines.findIndex(l => l.includes('docs/guide.md'))
  const col = (lines[row] ?? '').indexOf('docs/guide.md')

  await mouse.click(col, row, MouseButtons.LEFT)
  await settle()

  expect(stub.commands.goToDocument).not.toHaveBeenCalled()

  renderer.destroy()
})

test('no history and no breadcrumb rows renders nothing', async () => {
  const stub = makeStub({ historyDepth: 0, trailLabels: ['README.md'] })
  const { renderer, captureCharFrame } = await renderHeader(stub)

  expect(captureCharFrame()).not.toContain('README.md')

  renderer.destroy()
})
