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
  const entryPath = Bun.resolveSync(packageName, process.cwd())
  const pkgDir = dirname(entryPath)
  const libFileName = readdirSync(pkgDir).find(f => /\.(dylib|so|dll)$/.test(f))
  if (!libFileName) {
    throw new Error(`No native library found in ${pkgDir} for ${packageName}`)
  }
  const pkg = require(join(pkgDir, 'package.json'))
  return { packageName, version: pkg.version, libPath: join(pkgDir, libFileName), libFileName }
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
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const CACHED_NAME = ${JSON.stringify(cachedName)}
const STALE_PREFIXES = [${JSON.stringify(`${base}-`)}, ${JSON.stringify(`.${base}-`)}]

function cacheDir() {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || tmpdir(), 'viewmd', 'cache')
  if (process.env.XDG_CACHE_HOME) return join(process.env.XDG_CACHE_HOME, 'viewmd')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'viewmd')
  return join(homedir(), '.cache', 'viewmd')
}

function materialize() {
  const dir = cacheDir()
  const target = join(dir, CACHED_NAME)
  if (existsSync(target)) return target
  mkdirSync(dir, { recursive: true })
  // Write to a pid-unique temp file and rename so concurrent processes never
  // dlopen a partially written library.
  const tmp = join(dir, \`.\${CACHED_NAME}.\${process.pid}.tmp\`)
  writeFileSync(tmp, readFileSync(embedded))
  try {
    renameSync(tmp, target)
  } catch {
    // Another process won the race (or Windows refused to replace an open file).
    rmSync(tmp, { force: true })
    if (!existsSync(target)) throw new Error(\`failed to materialize \${target}\`)
  }
  prune(dir)
  return target
}

function prune(dir) {
  for (const f of readdirSync(dir)) {
    if (f === CACHED_NAME) continue
    if (!STALE_PREFIXES.some(p => f.startsWith(p))) continue
    try {
      rmSync(join(dir, f), { force: true })
    } catch {}
  }
}

let libPath
try {
  libPath = materialize()
} catch {
  // Fall back to Bun's per-run extraction of the embedded file.
  libPath = embedded
}

export default libPath
`
}
