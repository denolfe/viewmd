import { describe, expect, test } from 'bun:test'
import { navReducer } from './documentNavigation'
import type { HistoryEntry, NavState } from './documentNavigation'
import type { LoadedDocument } from './loadDocument'

function makeDoc(label: string): LoadedDocument {
  return {
    nodes: [],
    toc: [],
    headingIds: [],
    headingLines: {},
    frontmatter: [],
    fileLabel: label,
    absPath: `/docs/${label}.md`,
    dir: '/docs',
  }
}

function initial(doc: LoadedDocument): NavState {
  return { doc, history: [], intent: null }
}

const a = makeDoc('a')
const b = makeDoc('b')

describe('navReducer', () => {
  test('FOLLOW_LOADED with anchor: pushes history, swaps doc, postSwap anchor intent, full reset', () => {
    const from: HistoryEntry = { document: a, scrollTop: 42, currentHeadingId: 'intro' }
    const next = navReducer(initial(a), { type: 'FOLLOW_LOADED', doc: b, from, anchor: 'usage' })
    expect(next.doc).toBe(b)
    expect(next.history).toEqual([from])
    expect(next.intent).toEqual({
      scroll: { kind: 'anchor', headingId: 'usage', postSwap: true },
      reset: 'full',
      seq: 1,
    })
  })

  test('FOLLOW_LOADED without anchor: top intent', () => {
    const from: HistoryEntry = { document: a, scrollTop: 0, currentHeadingId: null }
    const next = navReducer(initial(a), { type: 'FOLLOW_LOADED', doc: b, from })
    expect(next.intent?.scroll).toEqual({ kind: 'top' })
    expect(next.intent?.reset).toBe('full')
  })

  test('BACK with history: pops entry, restores doc, restore intent, full reset', () => {
    const from: HistoryEntry = { document: a, scrollTop: 7, currentHeadingId: 'intro' }
    const swapped = navReducer(initial(a), { type: 'FOLLOW_LOADED', doc: b, from })
    const back = navReducer(swapped, { type: 'BACK' })
    expect(back.doc).toBe(a)
    expect(back.history).toEqual([])
    expect(back.intent).toEqual({
      scroll: { kind: 'restore', scrollTop: 7, currentHeadingId: 'intro' },
      reset: 'full',
      seq: 2,
    })
  })

  test('BACK with empty history: no-op', () => {
    const state = initial(a)
    expect(navReducer(state, { type: 'BACK' })).toBe(state)
  })

  test('BACK_TO an earlier index: restores that doc, discards docs visited after it', () => {
    const c = makeDoc('c')
    const fromA: HistoryEntry = { document: a, scrollTop: 7, currentHeadingId: 'intro' }
    const fromB: HistoryEntry = { document: b, scrollTop: 20, currentHeadingId: 'usage' }
    // Chain: a -> b -> c. history = [fromA, fromB], current doc = c.
    const atB = navReducer(initial(a), { type: 'FOLLOW_LOADED', doc: b, from: fromA })
    const atC = navReducer(atB, { type: 'FOLLOW_LOADED', doc: c, from: fromB })
    const jumped = navReducer(atC, { type: 'BACK_TO', index: 0 })
    expect(jumped.doc).toBe(a)
    expect(jumped.history).toEqual([])
    expect(jumped.intent?.scroll).toEqual({
      kind: 'restore',
      scrollTop: 7,
      currentHeadingId: 'intro',
    })
    expect(jumped.intent?.reset).toBe('full')
  })

  test('BACK_TO an out-of-range index: no-op', () => {
    const from: HistoryEntry = { document: a, scrollTop: 0, currentHeadingId: null }
    const swapped = navReducer(initial(a), { type: 'FOLLOW_LOADED', doc: b, from })
    expect(navReducer(swapped, { type: 'BACK_TO', index: 5 })).toBe(swapped)
  })

  test('RELOAD_LOADED with current heading: unchanged history, searchOnly reset, postSwap anchor', () => {
    const state: NavState = { doc: a, history: [], intent: null }
    const next = navReducer(state, { type: 'RELOAD_LOADED', doc: b, anchor: 'intro' })
    expect(next.doc).toBe(b)
    expect(next.history).toEqual([])
    expect(next.intent).toEqual({
      scroll: { kind: 'anchor', headingId: 'intro', postSwap: true },
      reset: 'searchOnly',
      seq: 1,
    })
  })

  test('RELOAD_LOADED with no current heading: top intent', () => {
    const next = navReducer(initial(a), { type: 'RELOAD_LOADED', doc: b, anchor: null })
    expect(next.intent?.scroll).toEqual({ kind: 'top' })
    expect(next.intent?.reset).toBe('searchOnly')
  })

  test('IN_DOC_JUMP: doc + history unchanged, none reset', () => {
    const scroll = { kind: 'anchor', headingId: 'foo-bar', postSwap: false } as const
    const next = navReducer(initial(a), { type: 'IN_DOC_JUMP', scroll })
    expect(next.doc).toBe(a)
    expect(next.history).toEqual([])
    expect(next.intent).toEqual({ scroll, reset: 'none', seq: 1 })
  })

  test('seq increments across successive intent-emitting actions', () => {
    const s1 = navReducer(initial(a), { type: 'IN_DOC_JUMP', scroll: { kind: 'top' } })
    const s2 = navReducer(s1, { type: 'IN_DOC_JUMP', scroll: { kind: 'top' } })
    expect(s1.intent?.seq).toBe(1)
    expect(s2.intent?.seq).toBe(2)
  })
})
