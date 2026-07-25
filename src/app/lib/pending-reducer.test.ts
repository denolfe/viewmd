import { describe, expect, test } from 'bun:test'
import { pendingReducer, IDLE } from './pending-reducer'
import type { PendingState, PendingTarget } from './pending-reducer'

const heading: PendingTarget = { kind: 'heading', id: 'h1', topOffset: 0 }
const scrollTop: PendingTarget = { kind: 'scrollTop', top: 500 }

const pendingSwap = (target: PendingTarget): PendingState => ({ pending: target, isSwap: true })
const pendingJump = (target: PendingTarget): PendingState => ({ pending: target, isSwap: false })

describe('issueJump', () => {
  test('resolves now: scrolls and clears', () => {
    const r = pendingReducer(IDLE, {
      kind: 'issueJump',
      target: heading,
      resolution: { delta: 12, reached: true },
    })
    expect(r).toEqual({ state: IDLE, effects: [{ kind: 'scrollBy', delta: 12 }] })
  })

  test('resolves now with delta 0: clears, no scroll effect', () => {
    const r = pendingReducer(IDLE, {
      kind: 'issueJump',
      target: heading,
      resolution: { delta: 0, reached: true },
    })
    expect(r).toEqual({ state: IDLE, effects: [] })
  })

  test('unmounted: queues as non-swap, no effects', () => {
    const r = pendingReducer(IDLE, { kind: 'issueJump', target: heading, resolution: null })
    expect(r).toEqual({ state: pendingJump(heading), effects: [] })
  })
})

describe('pinJump', () => {
  test('always queues as swap, no effects', () => {
    expect(pendingReducer(IDLE, { kind: 'pinJump', target: scrollTop })).toEqual({
      state: pendingSwap(scrollTop),
      effects: [],
    })
  })
})

describe('frameTick', () => {
  test('no pending: no-op', () => {
    const r = pendingReducer(IDLE, {
      kind: 'frameTick',
      resolution: { delta: 5, reached: true },
      fullyMounted: false,
    })
    expect(r).toEqual({ state: IDLE, effects: [] })
  })

  test('reached non-swap: scrolls, clears, no repositioned', () => {
    const r = pendingReducer(pendingJump(heading), {
      kind: 'frameTick',
      resolution: { delta: 8, reached: true },
      fullyMounted: false,
    })
    expect(r).toEqual({ state: IDLE, effects: [{ kind: 'scrollBy', delta: 8 }] })
  })

  test('reached swap: scrolls, clears, fires repositioned', () => {
    const r = pendingReducer(pendingSwap(scrollTop), {
      kind: 'frameTick',
      resolution: { delta: 8, reached: true },
      fullyMounted: false,
    })
    expect(r).toEqual({
      state: IDLE,
      effects: [{ kind: 'scrollBy', delta: 8 }, { kind: 'repositioned' }],
    })
  })

  test('not reached: scrolls but keeps chasing', () => {
    const s = pendingSwap(scrollTop)
    const r = pendingReducer(s, {
      kind: 'frameTick',
      resolution: { delta: 20, reached: false },
      fullyMounted: false,
    })
    expect(r).toEqual({ state: s, effects: [{ kind: 'scrollBy', delta: 20 }] })
  })

  test('not reached + fully mounted swap: scrolls to clamp, bails, fires repositioned', () => {
    const r = pendingReducer(pendingSwap(scrollTop), {
      kind: 'frameTick',
      resolution: { delta: 20, reached: false },
      fullyMounted: true,
    })
    expect(r).toEqual({
      state: IDLE,
      effects: [{ kind: 'scrollBy', delta: 20 }, { kind: 'repositioned' }],
    })
  })

  test('null + not fully mounted: keep waiting', () => {
    const s = pendingJump(heading)
    const r = pendingReducer(s, { kind: 'frameTick', resolution: null, fullyMounted: false })
    expect(r).toEqual({ state: s, effects: [] })
  })

  test('null + fully mounted swap: bail, fires repositioned once', () => {
    const r = pendingReducer(pendingSwap(heading), {
      kind: 'frameTick',
      resolution: null,
      fullyMounted: true,
    })
    expect(r).toEqual({ state: IDLE, effects: [{ kind: 'repositioned' }] })
  })

  test('null + fully mounted non-swap: bail, no repositioned', () => {
    const r = pendingReducer(pendingJump(heading), {
      kind: 'frameTick',
      resolution: null,
      fullyMounted: true,
    })
    expect(r).toEqual({ state: IDLE, effects: [] })
  })
})

describe('userScroll', () => {
  test('idle: no-op', () => {
    expect(pendingReducer(IDLE, { kind: 'userScroll' })).toEqual({ state: IDLE, effects: [] })
  })

  test('pending non-swap: clears, no repositioned', () => {
    expect(pendingReducer(pendingJump(heading), { kind: 'userScroll' })).toEqual({
      state: IDLE,
      effects: [],
    })
  })

  test('pending swap: clears, fires repositioned', () => {
    expect(pendingReducer(pendingSwap(scrollTop), { kind: 'userScroll' })).toEqual({
      state: IDLE,
      effects: [{ kind: 'repositioned' }],
    })
  })
})

describe('repositioned fires exactly once per swap', () => {
  test('settle then a second frameTick does not re-fire', () => {
    const first = pendingReducer(pendingSwap(scrollTop), {
      kind: 'frameTick',
      resolution: { delta: 4, reached: true },
      fullyMounted: false,
    })
    expect(first.effects).toContainEqual({ kind: 'repositioned' })
    const second = pendingReducer(first.state, {
      kind: 'frameTick',
      resolution: { delta: 4, reached: true },
      fullyMounted: false,
    })
    expect(second).toEqual({ state: IDLE, effects: [] })
  })
})
