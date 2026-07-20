export function resolveEditorCommand(env: NodeJS.ProcessEnv): string {
  return env.VIEWMD_EDITOR_COMMAND?.trim() || env.EDITOR?.trim() || 'vi'
}

export function buildEditorArgv(params: { command: string; filePath: string }): string[] {
  const tokens = tokenize(params.command)
  if (tokens.length === 0) return ['vi', params.filePath]
  const hasPlaceholder = tokens.some(t => t.includes('{file}'))
  if (hasPlaceholder) return tokens.map(t => t.replaceAll('{file}', params.filePath))
  return [...tokens, params.filePath]
}

// Whitespace-split honoring single/double quotes. No shell expansion (no glob,
// no $VAR) — keeps spawning predictable and safe.
function tokenize(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let hasToken = false
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      hasToken = true
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (hasToken) tokens.push(current)
      current = ''
      hasToken = false
      continue
    }
    current += ch
    hasToken = true
  }
  if (hasToken) tokens.push(current)
  return tokens
}
