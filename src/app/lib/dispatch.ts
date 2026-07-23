import type { Action } from './keys'
import type { Commands } from './commands'

export function dispatch(action: Action, c: Commands): void {
  switch (action.kind) {
    case 'quit':
      return c.quit()
    case 'scrollLine':
      return c.scrollBy(action.delta)
    case 'scrollPage':
      return c.scrollPage(action.delta)
    case 'scrollHalf':
      return c.scrollHalf(action.delta)
    case 'top':
      return c.scrollToTop()
    case 'bottom':
      return c.scrollToBottom()
    case 'nextHeading':
      return c.jumpHeadingBy(1)
    case 'prevHeading':
      return c.jumpHeadingBy(-1)
    case 'focusSidebar':
      return c.focusSidebar()
    case 'focusViewer':
      return c.focusViewer()
    case 'tocUp':
      return c.tocMove(-1)
    case 'tocDown':
      return c.tocMove(1)
    case 'tocToggle':
      return c.toggleCursorExpanded()
    case 'tocSelect':
      return c.jumpToCursor()
    case 'tocJump':
      return c.jumpToHeading(action.id)
    case 'tocToggleId':
      return c.toggleExpanded(action.id)
    case 'startSearch':
      return c.startSearch(action.dir)
    case 'nextMatch':
      return c.stepMatch(1)
    case 'prevMatch':
      return c.stepMatch(-1)
    case 'clearSearch':
      return c.clearSearch()
    case 'toggleMouse':
      return c.toggleMouse()
    case 'openEditor':
      return c.openEditor()
    case 'goBack':
      return c.goBack()
    case 'toggleTocVisible':
      return c.toggleTocVisible()
    case 'noop':
      return
  }
}
