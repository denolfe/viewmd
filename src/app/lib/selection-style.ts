import { TextBufferRenderable } from '@opentui/core'
import type { Selection } from '@opentui/core'

/**
 * HACK: OpenTUI has no app-wide selection color. `selectionBg` is a per-renderable
 * prop and an unset one paints the selection as reverse video, so a theme color
 * would otherwise have to be threaded through every `<text>` in the app — and
 * every one added later. Seeding it on the shared base prototype, right before
 * the renderable paints its selection, covers progressively mounted nodes too.
 * An explicit `selectionBg` prop still wins.
 */
export function installSelectionColors(bg: string): () => void {
  const proto: PatchedProto = TextBufferRenderable.prototype
  // The prototype is process-wide: a second install (two Apps in one test run)
  // would wrap the wrapper, and then an out-of-order uninstall would restore it.
  if (proto[PATCHED]) return () => {}
  const original = proto.onSelectionChanged

  proto.onSelectionChanged = function (this: TextBufferRenderable, selection: Selection | null) {
    if (!this.selectionBg) this.selectionBg = bg
    return original.call(this, selection)
  }
  proto[PATCHED] = true

  return () => {
    proto.onSelectionChanged = original
    proto[PATCHED] = false
  }
}

const PATCHED = Symbol.for('viewmd.selectionColorsInstalled')

type PatchedProto = TextBufferRenderable & { [PATCHED]?: boolean }
