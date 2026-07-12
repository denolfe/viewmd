export type ParsedArgs = {
  filePath?: string
  forceRender?: boolean
  /** Cap --render output to this many rows (e.g. fzf preview panes). */
  maxLines?: number
  /** Set when arguments are malformed; caller prints it and exits non-zero. */
  error?: string
}

const MAX_LINES_ERROR = '--max-lines requires a positive integer'

export function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === undefined) continue
    if (a === '--render' || a === '-r') {
      out.forceRender = true
      continue
    }
    if (a === '--max-lines' || a.startsWith('--max-lines=')) {
      const raw = a.includes('=') ? a.slice('--max-lines='.length) : args[++i]
      const maxLines = parsePositiveInt(raw)
      if (maxLines === undefined) return { error: MAX_LINES_ERROR }
      out.maxLines = maxLines
      continue
    }
    if (a.startsWith('-')) continue
    if (out.filePath === undefined) out.filePath = a
  }
  return out
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : undefined
}
