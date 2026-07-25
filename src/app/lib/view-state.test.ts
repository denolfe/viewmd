import { describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { createElement } from 'react'
import type { TocEntry } from './ast'
import { useViewState } from './view-state'
import type { ViewActions, ViewState } from './view-state'

const TOC: TocEntry[] = [{ id: 'h1', level: 1, text: 'H1', inline: [], children: [] }]

/**
 * Mounts `useViewState` inside a headless renderer via a null-rendering
 * harness component, so tests can drive the hook's actions and observe the
 * resulting state through real React re-renders.
 */
async function mountHook(seedVisible: Set<string>) {
  let latest: { state: ViewState; actions: ViewActions } | null = null
  function Harness() {
    latest = useViewState({ seedVisible })
    return null
  }
  const { renderer, flush, renderOnce } = await createTestRenderer({ width: 40, height: 10 })
  const settle = async () => {
    await flush({ maxPasses: 20 })
    await new Promise(r => setTimeout(r, 10))
    await renderOnce()
  }

  createRoot(renderer).render(createElement(Harness))
  await settle()

  const read = (): ViewState => {
    if (!latest) throw new Error('useViewState did not run')
    return latest.state
  }
  const actions = (): ViewActions => {
    if (!latest) throw new Error('useViewState did not run')
    return latest.actions
  }
  return { read, actions, settle, destroy: () => renderer.destroy() }
}

describe('useViewState', () => {
  test('seeds visibleHeadingIds and defaults every other field', async () => {
    const seed = new Set(['a', 'b'])
    const { read, destroy } = await mountHook(seed)
    try {
      const state = read()
      expect(state.visibleHeadingIds).toBe(seed)
      expect(state.focus).toBe('viewer')
      expect(state.currentHeadingId).toBeNull()
      expect(state.expanded.size).toBe(0)
      expect(state.tocCursorId).toBeNull()
      expect(state.search).toBeNull()
      expect(state.tocVisible).toBe(true)
      expect(state.helpVisible).toBe(false)
      expect(state.mouseEnabled).toBe(false)
    } finally {
      destroy()
    }
  })

  test('actions object identity is stable across state changes', async () => {
    const { read, actions, settle, destroy } = await mountHook(new Set())
    try {
      const before = actions()
      before.focus('sidebar')
      await settle()
      expect(read().focus).toBe('sidebar')
      expect(actions()).toBe(before)
    } finally {
      destroy()
    }
  })

  test('toggleExpanded delegates to toggleTocExpanded, flipping the bool', async () => {
    const { read, actions, settle, destroy } = await mountHook(new Set())
    try {
      actions().toggleExpanded({ toc: TOC, id: 'h1' })
      await settle()
      expect(read().expanded.get('h1')).toBe(false)

      actions().toggleExpanded({ toc: TOC, id: 'h1' })
      await settle()
      expect(read().expanded.get('h1')).toBe(true)
    } finally {
      destroy()
    }
  })

  test('toggleMouse, toggleTocVisible, toggleHelp flip their bools', async () => {
    const { read, actions, settle, destroy } = await mountHook(new Set())
    try {
      actions().toggleMouse()
      actions().toggleTocVisible()
      actions().toggleHelp()
      await settle()
      const state = read()
      expect(state.mouseEnabled).toBe(true)
      expect(state.tocVisible).toBe(false)
      expect(state.helpVisible).toBe(true)
    } finally {
      destroy()
    }
  })
})
