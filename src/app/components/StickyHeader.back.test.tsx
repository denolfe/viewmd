import { test, expect, mock } from 'bun:test'
import { createTestRenderer, createMockMouse, MouseButtons } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { StickyHeader } from './StickyHeader'
import { AppStateContext } from '../state'
import type { AppState } from '../state'

function makeStub(overrides: Partial<AppState> = {}): AppState {
  return {
    focus: 'viewer',
    setFocus: mock(),
    currentHeadingId: null,
    setCurrentHeadingId: mock(),
    // Unused by StickyHeader; provided so the context object type-checks.
    viewerRef: { current: null },
    expanded: new Map(),
    toggleExpanded: mock(),
    tocCursorId: null,
    setTocCursorId: mock(),
    search: null,
    setSearch: mock(),
    mouseEnabled: false,
    toggleMouse: mock(),
    tocVisible: true,
    toggleTocVisible: mock(),
    visibleHeadingIds: new Set<string>(),
    setVisibleHeadingIds: mock(),
    contentWidth: 80,
    dir: undefined,
    followLink: mock(),
    goBack: mock(),
    historyDepth: 0,
    contentMaxWidth: 80,
    status: { kind: 'idle' },
    setStatus: mock(),
    ...overrides,
  } as AppState
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

test('back badge renders and clicking it calls goBack', async () => {
  const stub = makeStub({ historyDepth: 1 })
  const { renderer, settle, captureCharFrame } = await renderHeader(stub)
  const mouse = createMockMouse(renderer)

  const frame = captureCharFrame()
  expect(frame).toContain('Back')

  const lines = frame.split('\n')
  const row = lines.findIndex(l => l.includes('Back'))
  expect(row).toBeGreaterThanOrEqual(0)
  const col = (lines[row] ?? '').indexOf('Back')

  await mouse.click(col, row, MouseButtons.LEFT)
  await settle()

  expect(stub.goBack).toHaveBeenCalled()

  renderer.destroy()
})

test('back affordance shows one arrow per depth level and the target filename', async () => {
  const stub = makeStub({ historyDepth: 3, backLabel: 'nav/reference.md' })
  const { renderer, captureCharFrame } = await renderHeader(stub)

  const frame = captureCharFrame()
  // One '‹' per navigation level, then the target document label.
  expect(frame).toContain('‹‹‹ Back')
  expect(frame).toContain('to nav/reference.md')

  renderer.destroy()
})

test('right-click on the badge does not call goBack', async () => {
  const stub = makeStub({ historyDepth: 1 })
  const { renderer, settle, captureCharFrame } = await renderHeader(stub)
  const mouse = createMockMouse(renderer)

  const lines = captureCharFrame().split('\n')
  const row = lines.findIndex(l => l.includes('Back'))
  const col = (lines[row] ?? '').indexOf('Back')

  await mouse.click(col, row, MouseButtons.RIGHT)
  await settle()

  expect(stub.goBack).not.toHaveBeenCalled()

  renderer.destroy()
})

test('no history and no breadcrumb rows renders nothing', async () => {
  const stub = makeStub({ historyDepth: 0 })
  const { renderer, captureCharFrame } = await renderHeader(stub)

  expect(captureCharFrame()).not.toContain('Back')

  renderer.destroy()
})
