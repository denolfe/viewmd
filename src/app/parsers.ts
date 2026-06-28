import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { FiletypeParserOptions } from '@opentui/core'

const ASSETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/parsers')

const wasm = (lang: string, file = `tree-sitter-${lang}.wasm`) => resolve(ASSETS_DIR, lang, file)
const highlights = (lang: string) => resolve(ASSETS_DIR, lang, 'highlights.scm')

export const extraParsers: FiletypeParserOptions[] = [
  parser('bash', ['sh', 'shell', 'zsh']),
  parser('python', ['py']),
  parser('rust', ['rs']),
  parser('go'),
  parser('json'),
  parser('yaml', ['yml']),
  parser('toml'),
  parser('html', ['htm']),
  parser('css'),
]

function parser(filetype: string, aliases?: string[]): FiletypeParserOptions {
  return {
    filetype,
    aliases,
    wasm: wasm(filetype),
    queries: { highlights: [highlights(filetype)] },
  }
}
