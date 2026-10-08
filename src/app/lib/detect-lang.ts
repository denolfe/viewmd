/**
 * Guess the language of an untagged fenced code block. Precision over recall:
 * a rule fires only on syntax that is near-unique to one language, and
 * anything else returns undefined so plain text (trees, logs, output) is not
 * miscolored. Returned names are info strings `infoStringToFiletype` resolves
 * to a bundled grammar.
 */
export function detectLang(value: string): string | undefined {
  if (value.startsWith('#!')) return shebangLang(firstLine(value))
  for (const rule of RULES) {
    if (rule.test(value)) return rule.lang
  }
  return undefined
}

type Rule = { lang: string; test: (value: string) => boolean }

const RULES: Rule[] = [
  { lang: 'bash', test: v => /^\$ \S/.test(v.trimStart()) },
  { lang: 'json', test: isJson },
  { lang: 'html', test: isHtml },
  // `package x;` (Java) has a semicolon and dotted path; Go's clause has neither.
  { lang: 'go', test: v => /^package [a-z_]\w*\s*$/m.test(v) },
  {
    lang: 'python',
    test: v =>
      /^(async )?def \w+\(.*\)(\s*->.*)?:\s*$/m.test(v) ||
      /^from [\w.]+ import \w/m.test(v) ||
      /^class \w+(\(.*\))?:\s*$/m.test(v),
  },
  {
    lang: 'rust',
    // Zig's `fn f() void {` has a bare return type, which this signature rejects.
    test: v =>
      /^(pub )?fn \w+(<.*>)?\(.*\)\s*(->.*)?\{?\s*$/m.test(v) ||
      /^use \w+::[\w:{}, *]+;\s*$/m.test(v),
  },
  {
    lang: 'toml',
    test: v => /^\[[\w.-]+\]\s*$/m.test(v) && /^[\w.-]+\s*=\s*\S/m.test(v),
  },
]

const INTERPRETER_LANGS: Record<string, string> = {
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  dash: 'bash',
  ksh: 'bash',
  python: 'python',
  node: 'javascript',
  bun: 'typescript',
  deno: 'typescript',
  tsx: 'typescript',
  'ts-node': 'typescript',
}

/** Interpreter parsing follows GitHub Linguist: unwrap `env` flags and `K=V` pairs, drop version suffixes. */
function shebangLang(line: string): string | undefined {
  const [path = '', ...args] = line.slice(2).trim().split(/\s+/)
  let interpreter = basename(path)
  if (interpreter === 'env') {
    interpreter = args.find(a => !a.startsWith('-') && !a.includes('=')) ?? ''
  }
  const name = interpreter.replace(/\.\d+$/, '').replace(/\d+$/, '')
  return INTERPRETER_LANGS[name]
}

const HTML_TAG_START =
  /^(<!--|<(html|head|body|div|span|p|a|img|br|h[1-6]|ul|ol|li|table|script|style)[\s/>])/

/**
 * The first line must open a known lowercase tag, which rules out components
 * (`<App />`) and generics (`<T>`). `={` marks a JSX expression attribute.
 */
function isHtml(value: string): boolean {
  const start = value.trimStart()
  if (/^<!doctype html/i.test(start)) return true
  return HTML_TAG_START.test(start) && !value.includes('={')
}

function isJson(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

function firstLine(value: string): string {
  const end = value.indexOf('\n')
  return end === -1 ? value : value.slice(0, end)
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
