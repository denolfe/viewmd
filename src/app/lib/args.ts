export type ParsedArgs = {
  filePath?: string
  forceRender?: boolean
}

export function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = {}
  for (const a of args) {
    if (a === '--render' || a === '-r') {
      out.forceRender = true
      continue
    }
    if (a.startsWith('-')) continue
    if (out.filePath === undefined) out.filePath = a
  }
  return out
}
