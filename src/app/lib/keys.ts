import type { KeyEvent } from '@opentui/core'

export type Focus = 'viewer' | 'sidebar' | 'search'

export type Action =
  | { kind: 'quit' }
  | { kind: 'scrollLine'; delta: number }
  | { kind: 'scrollPage'; delta: number }
  | { kind: 'scrollHalf'; delta: number }
  | { kind: 'top' }
  | { kind: 'bottom' }
  | { kind: 'nextHeading' }
  | { kind: 'prevHeading' }
  | { kind: 'focusSidebar' }
  | { kind: 'focusViewer' }
  | { kind: 'tocSelect' }
  | { kind: 'tocJump'; id: string }
  | { kind: 'tocToggleId'; id: string }
  | { kind: 'tocToggle' }
  | { kind: 'tocUp' }
  | { kind: 'tocDown' }
  | { kind: 'toggleTocVisible' }
  | { kind: 'startSearch'; dir: 'forward' | 'backward' }
  | { kind: 'nextMatch' }
  | { kind: 'prevMatch' }
  | { kind: 'clearSearch' }
  | { kind: 'toggleMouse' }
  | { kind: 'openEditor' }
  | { kind: 'goBack' }
  | { kind: 'noop' }

export type Ctx = { searchActive?: boolean }

export function mapKey(ev: KeyEvent, focus: Focus, ctx: Ctx = {}): Action {
  if (ev.name === 'c' && ev.ctrl) return { kind: 'quit' }
  if (focus === 'sidebar') return mapSidebar(ev)
  return mapViewer(ev, ctx)
}

function mapViewer(ev: KeyEvent, ctx: Ctx): Action {
  switch (ev.name) {
    case 'q':
      return { kind: 'quit' }
    case 'j':
    case 'down':
      return { kind: 'scrollLine', delta: 1 }
    case 'k':
    case 'up':
      return { kind: 'scrollLine', delta: -1 }
    case 'space':
    case 'pagedown':
      return { kind: 'scrollPage', delta: 1 }
    case 'b':
    case 'pageup':
      return { kind: 'scrollPage', delta: -1 }
    case 'd':
      return { kind: 'scrollHalf', delta: 1 }
    case 'u':
      return { kind: 'scrollHalf', delta: -1 }
    case 'g':
      return ev.shift ? { kind: 'bottom' } : { kind: 'top' }
    case 'tab':
      return { kind: 'focusSidebar' }
    case 'm':
      return { kind: 'toggleMouse' }
    case 'e':
      return { kind: 'openEditor' }
    case 't':
      return { kind: 'toggleTocVisible' }
    case '/':
      return { kind: 'startSearch', dir: 'forward' }
    case '?':
      return { kind: 'startSearch', dir: 'backward' }
    case 'n':
      if (ev.shift) return ctx.searchActive ? { kind: 'prevMatch' } : { kind: 'prevHeading' }
      return ctx.searchActive ? { kind: 'nextMatch' } : { kind: 'nextHeading' }
    case 'escape':
      return { kind: 'clearSearch' }
    case 'backspace':
      return { kind: 'goBack' }
    default:
      return { kind: 'noop' }
  }
}

function mapSidebar(ev: KeyEvent): Action {
  switch (ev.name) {
    case 'tab':
      return { kind: 'focusViewer' }
    case 'q':
      return { kind: 'quit' }
    case 'down':
    case 'j':
      return { kind: 'tocDown' }
    case 'up':
    case 'k':
      return { kind: 'tocUp' }
    case 'space':
      return { kind: 'tocToggle' }
    case 'return':
      return { kind: 'tocSelect' }
    case 't':
      return { kind: 'toggleTocVisible' }
    case 'escape':
      return { kind: 'focusViewer' }
    default:
      return { kind: 'noop' }
  }
}
