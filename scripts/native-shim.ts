import { readdirSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { Platform } from './platforms'

export type NativeLib = {
  /** e.g. @opentui/core-darwin-arm64 */
  packageName: string
  /** Version of the installed native package, keys the cache filename. */
  version: string
  /** Absolute path to the native library on the build host. */
  libPath: string
  /** e.g. libopentui.dylib */
  libFileName: string
}

export function opentuiNativePackageName(platform: Platform): string {
  return `@opentui/core-${platform.os}-${platform.cpu}`
}

/**
 * Locate the installed OpenTUI native package for a platform. Builds run on
 * native runners, so the matching package is always present in node_modules.
 */
export function resolveNativeLib(platform: Platform): NativeLib {
  const packageName = opentuiNativePackageName(platform)
  const pkgDir = resolvePackageDir(packageName)
  const libFileName = readdirSync(pkgDir).find(f => /\.(dylib|so|dll)$/.test(f))
  if (!libFileName) {
    throw new Error(`No native library found in ${pkgDir} for ${packageName}`)
  }
  return {
    packageName,
    version: packageVersion(pkgDir),
    libPath: join(pkgDir, libFileName),
    libFileName,
  }
}

export function resolvePackageDir(packageName: string): string {
  return dirname(Bun.resolveSync(packageName, process.cwd()))
}

export function packageVersion(pkgDir: string): string {
  const pkg = require(join(pkgDir, 'package.json'))
  return pkg.version
}

/**
 * Source for the module that replaces the OpenTUI native package inside the
 * compiled binary. OpenTUI dlopens the lib at import time; dlopen of an
 * embedded $bunfs path extracts ~3.7MB to a fresh temp file on every run
 * (~150ms + leaked files). The shim instead copies the embedded lib once to a
 * stable cache path and exports that, so later runs dlopen a real file the
 * kernel has already code-verified.
 *
 * Constraint: no top-level await and sync fs only, so the bundle stays
 * eligible for --bytecode.
 */
export function buildShimSource(params: {
  libPath: string
  libFileName: string
  version: string
}): string {
  const { libPath, libFileName, version } = params
  const ext = extname(libFileName)
  const base = basename(libFileName, ext)
  const cachedName = `${base}-${version}${ext}`

  return `import embedded from ${JSON.stringify(libPath)} with { type: 'file' }
${CACHE_HELPERS_IMPORTS}

const CACHED_NAME = ${JSON.stringify(cachedName)}
const STALE_PREFIXES = [${JSON.stringify(`${base}-`)}]

${CACHE_HELPERS_SOURCE}

let libPath
try {
  const dir = cacheDir()
  libPath = materializeInto(dir, CACHED_NAME, embedded)
  pruneEntries(dir, STALE_PREFIXES, CACHED_NAME)
} catch {
  // Fall back to Bun's per-run extraction of the embedded file.
  libPath = embedded
}

export default libPath
`
}

/**
 * Source for the module that replaces src/compiled-runtime.ts inside the
 * compiled binary. The tree-sitter worker can't ship as a bytecode compile
 * entrypoint (its wasm dynamic import breaks under CJS bytecode), so the
 * pre-bundled worker and its wasm are embedded as plain file assets,
 * materialized next to each other in the cache dir — preserving the worker's
 * relative wasm reference — and OTUI_TREE_SITTER_WORKER_PATH points at the
 * materialized entry.
 */
export function buildWorkerRuntimeSource(params: {
  entryName: string
  files: Array<{ absPath: string; name: string }>
  version: string
}): string {
  const { entryName, files, version } = params
  const imports = files
    .map(
      (f, i) => `import __workerFile${i} from ${JSON.stringify(f.absPath)} with { type: 'file' }`,
    )
    .join('\n')
  const fileList = files.map((f, i) => `[__workerFile${i}, ${JSON.stringify(f.name)}]`).join(', ')

  return `${imports}
${CACHE_HELPERS_IMPORTS}

const FILES = [${fileList}]
const DIR_NAME = ${JSON.stringify(`worker-${version}`)}

${CACHE_HELPERS_SOURCE}

try {
  const base = cacheDir()
  const dir = join(base, DIR_NAME)
  for (const [src, name] of FILES) materializeInto(dir, name, src)
  pruneEntries(base, ['worker-'], DIR_NAME)
  process.env.OTUI_TREE_SITTER_WORKER_PATH ||= join(dir, ${JSON.stringify(entryName)})
} catch {
  // Highlighting degrades gracefully when the worker can't materialize.
}
`
}

const CACHE_HELPERS_IMPORTS = `import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'`

const CACHE_HELPERS_SOURCE = `function cacheDir() {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || tmpdir(), 'viewmd', 'cache')
  if (process.env.XDG_CACHE_HOME) return join(process.env.XDG_CACHE_HOME, 'viewmd')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'viewmd')
  return join(homedir(), '.cache', 'viewmd')
}

function materializeInto(dir, name, srcPath) {
  const target = join(dir, name)
  if (existsSync(target)) return target
  mkdirSync(dir, { recursive: true })
  // Write to a pid-unique temp file and rename so concurrent processes never
  // read a partially written file.
  const tmp = join(dir, \`.\${name}.\${process.pid}.tmp\`)
  writeFileSync(tmp, readFileSync(srcPath))
  try {
    renameSync(tmp, target)
  } catch {
    // Another process won the race (or Windows refused to replace an open file).
    rmSync(tmp, { force: true })
    if (!existsSync(target)) throw new Error(\`failed to materialize \${target}\`)
  }
  return target
}

function pruneEntries(dir, stalePrefixes, keep) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const f of entries) {
    if (f === keep) continue
    if (!stalePrefixes.some(p => f.startsWith(p) || f.startsWith('.' + p))) continue
    try {
      rmSync(join(dir, f), { force: true, recursive: true })
    } catch {}
  }
}`
