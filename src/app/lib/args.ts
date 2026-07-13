import { parseArgs as parseArgsUtil } from 'node:util'

export type ParsedArgs = {
  filePath?: string
  forceRender?: boolean
  /** Cap --render output to this many rows (e.g. fzf preview panes). */
  maxLines?: number
  showHelp?: boolean
  showVersion?: boolean
  /** Set when arguments are malformed; caller prints it and exits non-zero. */
  error?: string
}

const MAX_LINES_ERROR = '--max-lines requires a positive integer'

export function parseArgs(args: string[]): ParsedArgs {
  let values: { render?: boolean; 'max-lines'?: string; help?: boolean; version?: boolean }
  let positionals: string[]
  try {
    ;({ values, positionals } = parseArgsUtil({
      args,
      options: {
        render: { type: 'boolean', short: 'r' },
        'max-lines': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: true,
      strict: true,
    }))
  } catch (e) {
    return { error: parseErrorMessage(e) }
  }

  const out: ParsedArgs = {}
  if (values.render) out.forceRender = true
  if (values.help) out.showHelp = true
  if (values.version) out.showVersion = true
  if (values['max-lines'] !== undefined) {
    const maxLines = parsePositiveInt(values['max-lines'])
    if (maxLines === undefined) return { error: MAX_LINES_ERROR }
    out.maxLines = maxLines
  }
  const filePath = positionals.find(p => p !== '-')
  if (filePath !== undefined) out.filePath = filePath
  return out
}

export function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function parseErrorMessage(e: unknown): string {
  const code = e instanceof Error && 'code' in e ? e.code : undefined
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' && e instanceof Error) {
    const flag = e.message.match(/'([^']+)'/)?.[1] ?? 'option'
    return `unknown option '${flag}' (run viewmd --help)`
  }
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') return MAX_LINES_ERROR
  return e instanceof Error ? e.message : String(e)
}
