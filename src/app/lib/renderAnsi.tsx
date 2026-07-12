import {
  CodeRenderable,
  TextAttributes,
  addDefaultParsers,
  getTreeSitterClient,
} from '@opentui/core'
import type { BaseRenderable, CapturedLine, CapturedSpan } from '@opentui/core'
import { dlopen, suffix } from 'bun:ffi'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { RenderView } from '../RenderView'
import { extraParsers } from '../parsers'
import type { Node } from './ast'
import type { FrontmatterRow } from './frontmatter'

let parsersRegistered = false

export async function renderAnsi(opts: {
  nodes: Node[]
  width: number
  maxHeight: number
  frontmatter?: FrontmatterRow[]
  /** Row cap for fzf preview / other preview tools. Unused until Task 6 wires slicing. */
  capRows?: number
}): Promise<string> {
  const { nodes, width, maxHeight, frontmatter = [] } = opts

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
    // The visual-idle waits below cost whole frame periods; at the default
    // 30fps two waits × two quiet frames stall ~130ms. The headless renderer
    // writes to a memory buffer, so a short frame period costs nothing.
    targetFps: 240,
  })
  // React subtree mounts one resize listener per component using useOnResize;
  // the default EventEmitter cap (10) trips a warning for non-trivial docs.
  setup.renderer.setMaxListeners(0)

  const root = createRoot(setup.renderer)
  // createRoot uses a ConcurrentRoot, so root.render commits asynchronously.
  // Without a synchronous flush the visual-idle poll below can observe an idle
  // scheduler (hasScheduledRender: false) before React commits and capture the
  // empty, U+0A00-filled buffer. flushSync forces the first commit so
  // requestRender() is scheduled before we wait.
  flushSync(() => {
    root.render(<RenderView nodes={nodes} width={width} frontmatter={frontmatter} />)
  })
  await setup.waitForVisualIdle({ quietFrames: 2, maxFrames: 240 })
  await waitForHighlights(setup.renderer.root)
  await setup.waitForVisualIdle({ quietFrames: 2, maxFrames: 240 })

  // captureSpans walks every buffer cell (two RGBA allocations per cell), so
  // capturing all maxHeight rows costs ~80ms even for a two-line doc. Measure
  // the content height from the cheap native char capture and shrink the
  // buffer to it before extracting spans.
  const contentRows = countContentRows(setup.captureCharFrame())
  if (contentRows < maxHeight) {
    setup.resize(width, Math.max(contentRows, 1))
    await setup.waitForVisualIdle({ quietFrames: 2, maxFrames: 240 })
  }

  const frame = setup.captureSpans()
  const text = frame.lines.map(lineToAnsi).join('\n')

  root.unmount()
  // Silence the highlight-failed warning that tree-sitter logs asynchronously
  // when destroyTreeSitterClient rejects in-flight requests during shutdown.
  // The warning fires on a later microtask, so we leave it suppressed and let
  // the caller's process exit clean up.
  console.warn = () => {}
  setup.renderer.destroy()
  restoreStdoutBlocking()
  return trimTrailingBlankRows(text)
}

/**
 * OpenTUI's renderer sets fd 1 to O_NONBLOCK at startup and never restores it,
 * not even on destroy(). A non-blocking stdout makes Bun.write busy-spin on
 * EAGAIN at 100% CPU forever when the pipe reader stalls or dies (the orphaned
 * viewmd processes), so clear the flag before the caller writes the frame.
 */
function restoreStdoutBlocking(): void {
  if (process.platform === 'win32') return
  const F_GETFL = 3
  const F_SETFL = 4
  const O_NONBLOCK = process.platform === 'darwin' ? 0x0004 : 0x0800
  try {
    const libc = dlopen(process.platform === 'darwin' ? `libc.${suffix}` : 'libc.so.6', {
      fcntl: { args: ['int', 'int', 'int'], returns: 'int' },
    })
    const flags = libc.symbols.fcntl(1, F_GETFL, 0)
    if (flags >= 0 && (flags & O_NONBLOCK) !== 0) {
      libc.symbols.fcntl(1, F_SETFL, flags & ~O_NONBLOCK)
    }
    libc.close()
  } catch {
    // Best effort: without libc access the flag stays as OpenTUI left it.
  }
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

/** Rows up to and including the last non-blank row of a captured char frame. */
function countContentRows(charFrame: string): number {
  const rows = charFrame.split('\n')
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row && row.trim() !== '') return i + 1
  }
  return 1
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
