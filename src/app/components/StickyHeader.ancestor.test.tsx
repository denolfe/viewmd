import { test, expect, mock } from 'bun:test'
import { createTestRenderer, createMockMouse, MouseButtons } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { StickyHeader } from './StickyHeader'
import { AppStateContext } from '../state'
import type { AppState } from '../state'
import { createNoopCommands } from '../lib/commands'
import { FILE_ROW_ID } from '../lib/overlay-rows'
import type { TocEntry } from '../lib/ast'

function makeStub(overrides: Partial<AppState> = {}): AppState {
  return {
    focus: 'viewer',
    currentHeadingId: null,
    viewerRef: { current: null },
    expanded: new Map(),
    tocCursorId: null,
    search: null,
    visibleHeadingIds: new Set<string>(),
    contentWidth: 80,
    dir: undefined,
    commands: createNoopCommands(),
    historyDepth: 0,
    trailLabels: [],
    contentMaxWidth: 80,
    status: { kind: 'idle' },
    helpVisible: false,
    ...overrides,
  }
}

function tocEntry(partial: Partial<TocEntry> & Pick<TocEntry, 'id' | 'level' | 'text'>): TocEntry {
  return {
    inline: [{ kind: 'text', value: partial.text }],
    children: [],
    ...partial,
  }
}

async function renderHeader(params: {
  stub: AppState
  toc: TocEntry[]
  fileLabel?: string
  onAncestorClick: (id: string) => void
}) {
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
    <AppStateContext.Provider value={params.stub}>
      <StickyHeader
        toc={params.toc}
        fileLabel={params.fileLabel}
        onAncestorClick={params.onAncestorClick}
      />
    </AppStateContext.Provider>,
  )
  await settle()
  return { renderer, settle, captureCharFrame }
}

async function clickText(
  helpers: {
    renderer: Parameters<typeof createMockMouse>[0]
    settle: () => Promise<void>
    captureCharFrame: () => string
  },
  needle: string,
  button: (typeof MouseButtons)[keyof typeof MouseButtons] = MouseButtons.LEFT,
) {
  const mouse = createMockMouse(helpers.renderer)
  const lines = helpers.captureCharFrame().split('\n')
  const row = lines.findIndex(l => l.includes(needle))
  expect(row).toBeGreaterThanOrEqual(0)
  const col = (lines[row] ?? '').indexOf(needle)
  await mouse.click(col, row, button)
  await helpers.settle()
}

const h1Toc: TocEntry[] = [
  tocEntry({
    id: 'alpha',
    level: 1,
    text: 'Alpha',
    children: [tocEntry({ id: 'beta', level: 2, text: 'Beta' })],
  }),
]

test('clicking a muted ancestor row calls onAncestorClick with its heading id', async () => {
  const onAncestorClick = mock()
  const stub = makeStub({ currentHeadingId: 'beta' })
  const h = await renderHeader({ stub, toc: h1Toc, onAncestorClick })

  await clickText(h, '## Beta')

  expect(onAncestorClick).toHaveBeenCalledWith('beta')
  h.renderer.destroy()
})

test('clicking the H1 pill row calls onAncestorClick with the H1 id', async () => {
  const onAncestorClick = mock()
  const stub = makeStub({ currentHeadingId: 'beta' })
  const h = await renderHeader({ stub, toc: h1Toc, onAncestorClick })

  await clickText(h, 'Alpha')

  expect(onAncestorClick).toHaveBeenCalledWith('alpha')
  h.renderer.destroy()
})

test('clicking the file-label pill calls onAncestorClick with FILE_ROW_ID', async () => {
  const onAncestorClick = mock()
  const noH1Toc: TocEntry[] = [tocEntry({ id: 'beta', level: 2, text: 'Beta' })]
  const stub = makeStub({ currentHeadingId: 'beta' })
  const h = await renderHeader({ stub, toc: noH1Toc, fileLabel: 'docs/readme.md', onAncestorClick })

  await clickText(h, 'docs/readme.md')

  expect(onAncestorClick).toHaveBeenCalledWith(FILE_ROW_ID)
  h.renderer.destroy()
})

test('right-click on an ancestor row does not call onAncestorClick', async () => {
  const onAncestorClick = mock()
  const stub = makeStub({ currentHeadingId: 'beta' })
  const h = await renderHeader({ stub, toc: h1Toc, onAncestorClick })

  await clickText(h, '## Beta', MouseButtons.RIGHT)

  expect(onAncestorClick).not.toHaveBeenCalled()
  h.renderer.destroy()
})
