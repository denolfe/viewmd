import type { FiletypeParserOptions } from '@opentui/core'

// Literal `type: 'file'` imports so `bun build --compile` embeds the assets;
// dynamic paths leave them out of the binary and the languages render unstyled.
import bashWasm from '../../assets/parsers/bash/tree-sitter-bash.wasm' with { type: 'file' }
import bashHighlights from '../../assets/parsers/bash/highlights.scm' with { type: 'file' }
import pythonWasm from '../../assets/parsers/python/tree-sitter-python.wasm' with { type: 'file' }
import pythonHighlights from '../../assets/parsers/python/highlights.scm' with { type: 'file' }
import rustWasm from '../../assets/parsers/rust/tree-sitter-rust.wasm' with { type: 'file' }
import rustHighlights from '../../assets/parsers/rust/highlights.scm' with { type: 'file' }
import goWasm from '../../assets/parsers/go/tree-sitter-go.wasm' with { type: 'file' }
import goHighlights from '../../assets/parsers/go/highlights.scm' with { type: 'file' }
import jsonWasm from '../../assets/parsers/json/tree-sitter-json.wasm' with { type: 'file' }
import jsonHighlights from '../../assets/parsers/json/highlights.scm' with { type: 'file' }
import yamlWasm from '../../assets/parsers/yaml/tree-sitter-yaml.wasm' with { type: 'file' }
import yamlHighlights from '../../assets/parsers/yaml/highlights.scm' with { type: 'file' }
import tomlWasm from '../../assets/parsers/toml/tree-sitter-toml.wasm' with { type: 'file' }
import tomlHighlights from '../../assets/parsers/toml/highlights.scm' with { type: 'file' }
import htmlWasm from '../../assets/parsers/html/tree-sitter-html.wasm' with { type: 'file' }
import htmlHighlights from '../../assets/parsers/html/highlights.scm' with { type: 'file' }
import cssWasm from '../../assets/parsers/css/tree-sitter-css.wasm' with { type: 'file' }
import cssHighlights from '../../assets/parsers/css/highlights.scm' with { type: 'file' }

export const extraParsers: FiletypeParserOptions[] = [
  parser('bash', bashWasm, bashHighlights, ['sh', 'shell', 'zsh']),
  parser('python', pythonWasm, pythonHighlights, ['py']),
  parser('rust', rustWasm, rustHighlights, ['rs']),
  parser('go', goWasm, goHighlights),
  parser('json', jsonWasm, jsonHighlights),
  parser('yaml', yamlWasm, yamlHighlights, ['yml']),
  parser('toml', tomlWasm, tomlHighlights),
  parser('html', htmlWasm, htmlHighlights, ['htm']),
  parser('css', cssWasm, cssHighlights),
]

function parser(
  filetype: string,
  wasm: string,
  highlights: string,
  aliases?: string[],
): FiletypeParserOptions {
  return { filetype, aliases, wasm, queries: { highlights: [highlights] } }
}
