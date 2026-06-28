import {
  CodeRenderable,
  TextAttributes,
  addDefaultParsers,
  getTreeSitterClient,
} from '@opentui/core'
import type { BaseRenderable, CapturedLine, CapturedSpan } from '@opentui/core'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot } from '@opentui/react'
import { RenderView } from '../RenderView'
import { extraParsers } from '../parsers'
import type { Node } from './ast'

let parsersRegistered = false

export async function renderAnsi(opts: {
  nodes: Node[]
  width: number
  maxHeight: number
}): Promise<string> {
  const { nodes, width, maxHeight } = opts

  if (!parsersRegistered) {
    addDefaultParsers(extraParsers)
    parsersRegistered = true
  }

  // Preload tree-sitter parsers for every fenced language present so the
  // first render captures highlighted spans rather than a fallback to plain
  // text. Without this, on a cold tree-sitter worker, highlightOnce can
  // reject before wasm finishes loading and the code commits unhighlighted.
  await preloadParsersForNodes(nodes)

  const setup = await createTestRenderer({
    width,
    height: maxHeight,
    exitOnCtrlC: false,
  })
  // React subtree mounts one resize listener per component using useOnResize;
  // the default EventEmitter cap (10) trips a warning for non-trivial docs.
  setup.renderer.setMaxListeners(0)

  const root = createRoot(setup.renderer)
  root.render(<RenderView nodes={nodes} width={width} />)
  // Give React's microtask-scheduled reconciler a chance to commit and call
  // requestRender() before we enter the visual-idle poll loop.
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  await setup.waitForVisualIdle({ quietFrames: 2, maxFrames: 240 })
  await waitForHighlights(setup.renderer.root)
  await setup.waitForVisualIdle({ quietFrames: 2, maxFrames: 240 })

  const frame = setup.captureSpans()
  const text = frame.lines.map(lineToAnsi).join('\n')

  root.unmount()
  // Silence the highlight-failed warning that tree-sitter logs asynchronously
  // when destroyTreeSitterClient rejects in-flight requests during shutdown.
  // The warning fires on a later microtask, so we leave it suppressed and let
  // the caller's process exit clean up.
  console.warn = () => {}
  setup.renderer.destroy()
  return trimTrailingBlankRows(text)
}

/** Convert a single captured line to an ANSI-colored string. */
function lineToAnsi(line: CapturedLine): string {
  let out = ''
  let needsReset = false

  for (const span of line.spans) {
    if (span.text === '') continue

    const codes = spanEscapeCodes(span)
    if (codes.length > 0) {
      // Prepend reset so previous attributes (BOLD/UNDERLINE/etc) don't bleed.
      out += `\x1b[0;${codes.join(';')}m`
      needsReset = true
    } else if (needsReset) {
      out += '\x1b[0m'
      needsReset = false
    }
    out += span.text
  }

  if (needsReset) out += '\x1b[0m'

  return out.replace(/\s+$/, '')
}

/**
 * Build the list of SGR parameter codes for a span.
 * Returns empty array when no styling applies (default fg/bg, no attributes).
 */
function spanEscapeCodes(span: CapturedSpan): number[] {
  const codes: number[] = []

  // Attributes
  if (span.attributes & TextAttributes.BOLD) codes.push(1)
  if (span.attributes & TextAttributes.DIM) codes.push(2)
  if (span.attributes & TextAttributes.ITALIC) codes.push(3)
  if (span.attributes & TextAttributes.UNDERLINE) codes.push(4)
  if (span.attributes & TextAttributes.BLINK) codes.push(5)
  if (span.attributes & TextAttributes.INVERSE) codes.push(7)
  if (span.attributes & TextAttributes.HIDDEN) codes.push(8)
  if (span.attributes & TextAttributes.STRIKETHROUGH) codes.push(9)

  // Foreground: emit 24-bit truecolor unless it's the renderer-default white
  // (which we treat as terminal-default to avoid forcing a foreground color).
  if (span.fg.intent !== 'default') {
    const [r, g, b] = toRgb8(span.fg)
    if (!(r === 255 && g === 255 && b === 255)) codes.push(38, 2, r, g, b)
  }

  // Background: emit 24-bit truecolor unless it's the renderer-default black
  // (forcing black bg breaks light terminals and fzf preview panes).
  if (span.bg.intent !== 'default') {
    const [r, g, b] = toRgb8(span.bg)
    if (!(r === 0 && g === 0 && b === 0)) codes.push(48, 2, r, g, b)
  }

  return codes
}

/** Convert RGBA (0–1 floats via .r/.g/.b getters) to 0–255 integers. */
function toRgb8(rgba: CapturedSpan['fg']): [number, number, number] {
  return [Math.round(rgba.r * 255), Math.round(rgba.g * 255), Math.round(rgba.b * 255)]
}

async function preloadParsersForNodes(nodes: Node[]): Promise<void> {
  const langs = new Set<string>()
  collectLangs(nodes, langs)
  if (langs.size === 0) return
  const client = getTreeSitterClient()
  await Promise.all([...langs].map(lang => client.preloadParser(lang).catch(() => false)))
}

function collectLangs(nodes: Node[], out: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === 'code' && node.lang) out.add(node.lang)
  }
}

async function waitForHighlights(node: BaseRenderable): Promise<void> {
  const pending: Promise<void>[] = []
  collectHighlighting(node, pending)
  if (pending.length === 0) return
  await Promise.all(pending.map(p => p.catch(() => {})))
}

function collectHighlighting(node: BaseRenderable, out: Promise<void>[]): void {
  if (node instanceof CodeRenderable && node.isHighlighting) {
    out.push(node.highlightingDone)
  }
  for (const child of node.getChildren()) collectHighlighting(child, out)
}

function trimTrailingBlankRows(frame: string): string {
  const lines = frame.split('\n').map(line => line.replace(/\s+$/u, ''))
  while (lines.length > 0) {
    const last = lines[lines.length - 1] ?? ''
    if (stripAnsi(last).trim() !== '') break
    lines.pop()
  }
  return lines.join('\n')
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
