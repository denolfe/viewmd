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
  | { kind: 'startSearch' }
  | { kind: 'nextMatch' }
  | { kind: 'prevMatch' }
  | { kind: 'clearSearch' }
  | { kind: 'toggleMouse' }
  | { kind: 'openEditor' }
  | { kind: 'goBack' }
  | { kind: 'toggleHelp' }
  | { kind: 'noop' }

export type Ctx = { searchActive?: boolean; helpOpen?: boolean }

export function mapKey(ev: KeyEvent, focus: Focus, ctx: Ctx = {}): Action {
  if (ev.name === 'c' && ev.ctrl) return { kind: 'quit' }
  if (ctx.helpOpen) return mapHelpOpen(ev)
  if (focus === 'sidebar') return mapSidebar(ev)
  return mapViewer(ev, ctx)
}

// While the help panel is modal, only its close keys and quit act; everything
// else is swallowed so keystrokes don't scroll the masked content behind it.
function mapHelpOpen(ev: KeyEvent): Action {
  if (ev.name === '?' || ev.name === 'escape') return { kind: 'toggleHelp' }
  if (ev.name === 'q') return { kind: 'quit' }
  return { kind: 'noop' }
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
      return { kind: 'startSearch' }
    case '?':
      return { kind: 'toggleHelp' }
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
    case '?':
      return { kind: 'toggleHelp' }
    default:
      return { kind: 'noop' }
  }
}

export type HintGroup = 'Navigation' | 'Search' | 'TOC & Sidebar' | 'General'

export type HintProbe = { ev: Partial<KeyEvent>; ctx?: Ctx; action: Action['kind'] }

/**
 * One documented shortcut. `probes` lets a test assert that every key in the
 * displayed `keys` string still maps to the Action the help claims (drift guard):
 * one probe per key, each a partial KeyEvent the test's `k()` helper completes.
 */
export type Hint = {
  keys: string
  desc: string
  group: HintGroup
  focus: Focus
  probes: HintProbe[]
}

export const HINTS: Hint[] = [
  // Navigation
  {
    keys: 'j / k',
    desc: 'Scroll line',
    group: 'Navigation',
    focus: 'viewer',
    probes: [
      { ev: { name: 'j' }, action: 'scrollLine' },
      { ev: { name: 'k' }, action: 'scrollLine' },
    ],
  },
  {
    keys: 'd / u',
    desc: 'Half page',
    group: 'Navigation',
    focus: 'viewer',
    probes: [
      { ev: { name: 'd' }, action: 'scrollHalf' },
      { ev: { name: 'u' }, action: 'scrollHalf' },
    ],
  },
  {
    keys: 'Space / b',
    desc: 'Page down / up',
    group: 'Navigation',
    focus: 'viewer',
    probes: [
      { ev: { name: 'space' }, action: 'scrollPage' },
      { ev: { name: 'b' }, action: 'scrollPage' },
    ],
  },
  {
    keys: 'g / G',
    desc: 'Top / bottom',
    group: 'Navigation',
    focus: 'viewer',
    probes: [
      { ev: { name: 'g' }, action: 'top' },
      { ev: { name: 'g', shift: true }, action: 'bottom' },
    ],
  },
  {
    keys: 'n / N',
    desc: 'Next / prev heading',
    group: 'Navigation',
    focus: 'viewer',
    probes: [
      { ev: { name: 'n' }, ctx: { searchActive: false }, action: 'nextHeading' },
      { ev: { name: 'n', shift: true }, ctx: { searchActive: false }, action: 'prevHeading' },
    ],
  },
  {
    keys: 'Backspace',
    desc: 'Back',
    group: 'Navigation',
    focus: 'viewer',
    probes: [{ ev: { name: 'backspace' }, action: 'goBack' }],
  },
  // Search
  {
    keys: '/',
    desc: 'Search',
    group: 'Search',
    focus: 'viewer',
    probes: [{ ev: { name: '/' }, action: 'startSearch' }],
  },
  {
    keys: 'n / N',
    desc: 'Next / prev match',
    group: 'Search',
    focus: 'viewer',
    probes: [
      { ev: { name: 'n' }, ctx: { searchActive: true }, action: 'nextMatch' },
      { ev: { name: 'n', shift: true }, ctx: { searchActive: true }, action: 'prevMatch' },
    ],
  },
  {
    keys: 'Esc',
    desc: 'Clear search',
    group: 'Search',
    focus: 'viewer',
    probes: [{ ev: { name: 'escape' }, action: 'clearSearch' }],
  },
  // TOC & Sidebar
  {
    keys: 'Tab',
    desc: 'Focus sidebar',
    group: 'TOC & Sidebar',
    focus: 'viewer',
    probes: [{ ev: { name: 'tab' }, action: 'focusSidebar' }],
  },
  {
    keys: 't',
    desc: 'Show / hide sidebar',
    group: 'TOC & Sidebar',
    focus: 'viewer',
    probes: [{ ev: { name: 't' }, action: 'toggleTocVisible' }],
  },
  {
    keys: 'Space',
    desc: 'Expand / collapse',
    group: 'TOC & Sidebar',
    focus: 'sidebar',
    probes: [{ ev: { name: 'space' }, action: 'tocToggle' }],
  },
  {
    keys: 'Enter',
    desc: 'Jump to heading',
    group: 'TOC & Sidebar',
    focus: 'sidebar',
    probes: [{ ev: { name: 'return' }, action: 'tocSelect' }],
  },
  // General
  {
    keys: '?',
    desc: 'Toggle this help',
    group: 'General',
    focus: 'viewer',
    probes: [{ ev: { name: '?' }, action: 'toggleHelp' }],
  },
  {
    keys: 'e',
    desc: 'Open in editor',
    group: 'General',
    focus: 'viewer',
    probes: [{ ev: { name: 'e' }, action: 'openEditor' }],
  },
  {
    keys: 'm',
    desc: 'Toggle mouse',
    group: 'General',
    focus: 'viewer',
    probes: [{ ev: { name: 'm' }, action: 'toggleMouse' }],
  },
  {
    keys: 'q',
    desc: 'Quit',
    group: 'General',
    focus: 'viewer',
    probes: [{ ev: { name: 'q' }, action: 'quit' }],
  },
]
