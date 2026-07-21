import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { addDefaultParsers } from '@opentui/core'
import type { KeyEvent } from '@opentui/core'
import { testRender } from '@opentui/react/test-utils'
import { App } from './App'
import { buildTree } from './lib/ast'
import { extraParsers } from './parsers'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
addDefaultParsers(extraParsers)

function pressKey(setup: Awaited<ReturnType<typeof testRender>>, name: string, sequence = name) {
  setup.renderer.keyInput.emit('keypress', {
    name,
    sequence,
    ctrl: false,
    shift: false,
    meta: false,
    option: false,
    eventType: 'press',
    repeated: false,
  } as KeyEvent)
}

describe('TOC file footer', () => {
  test('shows the file label at the bottom of the TOC and hides with it', async () => {
    const { nodes, toc, headingIds } = buildTree('# Title\n\n## Section\n\nBody.\n')
    const setup = await testRender(
      <App
        nodes={nodes}
        toc={toc}
        headingIds={headingIds}
        frontmatter={[]}
        headingLines={{}}
        fileLabel="GUIDE.md"
      />,
      { width: 120, height: 30 },
    )
    await setup.flush()

    const frame = setup.captureCharFrame()
    expect(frame).toContain('GUIDE.md')
    // Footer sits on the last TOC row, below every heading entry.
    const rows = frame.split('\n')
    const footerRow = rows.findIndex(r => r.includes('GUIDE.md'))
    const lastHeadingRow = rows.findLastIndex(r => r.includes('Section'))
    expect(footerRow).toBeGreaterThan(lastHeadingRow)

    // First keypress is consumed by the terminal capability handshake.
    await act(async () => pressKey(setup, 'x'))
    await act(async () => pressKey(setup, 't')) // hide TOC
    await setup.flush()
    await setup.renderOnce()
    expect(setup.captureCharFrame()).not.toContain('GUIDE.md')

    setup.renderer.destroy()
  })
})
