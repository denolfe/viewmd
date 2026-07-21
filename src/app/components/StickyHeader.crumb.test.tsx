import { test, expect, mock } from 'bun:test'
import { createTestRenderer, createMockMouse, MouseButtons } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { StickyHeader } from './StickyHeader'
import { AppStateContext } from '../state'
import type { AppState } from '../state'
import { FILE_ROW_ID } from '../lib/toc-util'
import type { TocEntry } from '../lib/ast'

function makeStub(overrides: Partial<AppState> = {}): AppState {
  return {
    focus: 'viewer',
    setFocus: mock(),
    currentHeadingId: null,
    setCurrentHeadingId: mock(),
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
  onCrumbClick: (id: string) => void
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
        onCrumbClick={params.onCrumbClick}
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

test('clicking a muted ancestor crumb calls onCrumbClick with its heading id', async () => {
  const onCrumbClick = mock()
  const stub = makeStub({ currentHeadingId: 'beta' })
  const h = await renderHeader({ stub, toc: h1Toc, onCrumbClick })

  await clickText(h, '## Beta')

  expect(onCrumbClick).toHaveBeenCalledWith('beta')
  h.renderer.destroy()
})

test('clicking the H1 pill crumb calls onCrumbClick with the H1 id', async () => {
  const onCrumbClick = mock()
  const stub = makeStub({ currentHeadingId: 'beta' })
  const h = await renderHeader({ stub, toc: h1Toc, onCrumbClick })

  await clickText(h, 'Alpha')

  expect(onCrumbClick).toHaveBeenCalledWith('alpha')
  h.renderer.destroy()
})

test('clicking the file-label pill calls onCrumbClick with FILE_ROW_ID', async () => {
  const onCrumbClick = mock()
  const noH1Toc: TocEntry[] = [tocEntry({ id: 'beta', level: 2, text: 'Beta' })]
  const stub = makeStub({ currentHeadingId: 'beta' })
  const h = await renderHeader({ stub, toc: noH1Toc, fileLabel: 'docs/readme.md', onCrumbClick })

  await clickText(h, 'docs/readme.md')

  expect(onCrumbClick).toHaveBeenCalledWith(FILE_ROW_ID)
  h.renderer.destroy()
})

test('right-click on a crumb does not call onCrumbClick', async () => {
  const onCrumbClick = mock()
  const stub = makeStub({ currentHeadingId: 'beta' })
  const h = await renderHeader({ stub, toc: h1Toc, onCrumbClick })

  await clickText(h, '## Beta', MouseButtons.RIGHT)

  expect(onCrumbClick).not.toHaveBeenCalled()
  h.renderer.destroy()
})
