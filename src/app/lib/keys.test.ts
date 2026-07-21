import { describe, expect, test } from 'bun:test'
import { mapKey } from './keys'
import type { KeyEvent } from '@opentui/core'

const k = (over: Partial<KeyEvent> = {}): KeyEvent =>
  ({
    name: '',
    sequence: '',
    ctrl: false,
    shift: false,
    meta: false,
    option: false,
    eventType: 'press',
    repeated: false,
    ...over,
  }) as KeyEvent

describe('mapKey (viewer focus)', () => {
  test('q -> quit', () => {
    expect(mapKey(k({ name: 'q' }), 'viewer')).toEqual({ kind: 'quit' })
  })
  test('ctrl-c -> quit', () => {
    expect(mapKey(k({ name: 'c', ctrl: true }), 'viewer')).toEqual({ kind: 'quit' })
  })
  test('j -> scrollLine +1', () => {
    expect(mapKey(k({ name: 'j' }), 'viewer')).toEqual({ kind: 'scrollLine', delta: 1 })
  })
  test('g -> top', () => {
    expect(mapKey(k({ name: 'g' }), 'viewer')).toEqual({ kind: 'top' })
  })
  test('tab -> focusSidebar', () => {
    expect(mapKey(k({ name: 'tab' }), 'viewer')).toEqual({ kind: 'focusSidebar' })
  })
  test('/ -> startSearch forward', () => {
    expect(mapKey(k({ name: '/' }), 'viewer')).toEqual({ kind: 'startSearch', dir: 'forward' })
  })
  test('n -> nextMatch when search active, nextHeading otherwise', () => {
    expect(mapKey(k({ name: 'n' }), 'viewer', { searchActive: true })).toEqual({
      kind: 'nextMatch',
    })
    expect(mapKey(k({ name: 'n' }), 'viewer', { searchActive: false })).toEqual({
      kind: 'nextHeading',
    })
  })
  test('shift-n -> prevMatch when search active, prevHeading otherwise', () => {
    expect(mapKey(k({ name: 'n', shift: true }), 'viewer', { searchActive: true })).toEqual({
      kind: 'prevMatch',
    })
    expect(mapKey(k({ name: 'n', shift: true }), 'viewer', { searchActive: false })).toEqual({
      kind: 'prevHeading',
    })
  })
  test('shift-g -> bottom', () => {
    expect(mapKey(k({ name: 'g', shift: true }), 'viewer')).toEqual({ kind: 'bottom' })
  })
  test('t -> toggleTocVisible', () => {
    expect(mapKey(k({ name: 't' }), 'viewer')).toEqual({ kind: 'toggleTocVisible' })
  })
  test('unmapped key -> noop', () => {
    expect(mapKey(k({ name: 'x' }), 'viewer')).toEqual({ kind: 'noop' })
  })
  test('e -> openEditor', () => {
    expect(mapKey(k({ name: 'e' }), 'viewer')).toEqual({ kind: 'openEditor' })
  })
  test('backspace -> goBack', () => {
    expect(mapKey(k({ name: 'backspace' }), 'viewer')).toEqual({ kind: 'goBack' })
  })
})

describe('mapKey (sidebar focus)', () => {
  test('enter -> tocSelect', () => {
    expect(mapKey(k({ name: 'return' }), 'sidebar')).toEqual({ kind: 'tocSelect' })
  })
  test('space -> tocToggle', () => {
    expect(mapKey(k({ name: 'space' }), 'sidebar')).toEqual({ kind: 'tocToggle' })
  })
  test('tab -> focusViewer', () => {
    expect(mapKey(k({ name: 'tab' }), 'sidebar')).toEqual({ kind: 'focusViewer' })
  })
  test('t -> toggleTocVisible', () => {
    expect(mapKey(k({ name: 't' }), 'sidebar')).toEqual({ kind: 'toggleTocVisible' })
  })
  test('e -> noop (not bound in sidebar)', () => {
    expect(mapKey(k({ name: 'e' }), 'sidebar')).toEqual({ kind: 'noop' })
  })
})
