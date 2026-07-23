const ERRNO_REASON: Record<string, string> = {
  ENOENT: 'no such file or directory',
  EACCES: 'permission denied',
  EISDIR: 'is a directory',
  ENOTDIR: 'not a directory',
}

/** Human-readable "cannot read '<path>': <reason>" for a file-read failure. */
export function fileReadErrorMessage(params: {
  code?: string
  path: string
  raw?: string
}): string {
  const { code, path, raw } = params
  const reason = (code && ERRNO_REASON[code]) || raw || 'unable to read file'
  return `cannot read '${path}': ${reason}`
}
