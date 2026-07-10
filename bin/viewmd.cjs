#!/usr/bin/env node
'use strict'
const { spawnSync } = require('node:child_process')
const { existsSync, chmodSync } = require('node:fs')
const path = require('node:path')

// Kept in sync with scripts/platforms.ts. Duplicated intentionally: the
// launcher must run on plain Node with zero dependencies and no build step.
const PLATFORM_PACKAGES = {
  'darwin-arm64': { pkg: 'viewmd-darwin-arm64', bin: 'viewmd' },
  'darwin-x64': { pkg: 'viewmd-darwin-x64', bin: 'viewmd' },
  'linux-x64': { pkg: 'viewmd-linux-x64', bin: 'viewmd' },
  'linux-arm64': { pkg: 'viewmd-linux-arm64', bin: 'viewmd' },
  'win32-x64': { pkg: 'viewmd-win32-x64', bin: 'viewmd.exe' },
}

function resolvePlatformBinary() {
  const entry = PLATFORM_PACKAGES[`${process.platform}-${process.arch}`]
  if (!entry) return null
  try {
    const pkgJson = require.resolve(`${entry.pkg}/package.json`)
    const binPath = path.join(path.dirname(pkgJson), 'bin', entry.bin)
    return existsSync(binPath) ? binPath : null
  } catch {
    return null
  }
}

function resolveBunFallback() {
  const main = path.join(__dirname, '..', 'dist', 'npm', 'main.js')
  if (!existsSync(main)) return null
  let bun = 'bun'
  try {
    bun = require.resolve('bun/bin/bun')
  } catch {}
  return { bun, main }
}

function exit(result) {
  if (result.error) {
    console.error(`viewmd: failed to launch: ${result.error.message}`)
    process.exit(1)
  }
  process.exit(result.status === null ? 1 : result.status)
}

function run() {
  const args = process.argv.slice(2)

  const override = process.env.VIEWMD_BIN_PATH
  if (override && existsSync(override)) {
    return exit(spawnSync(override, args, { stdio: 'inherit' }))
  }

  const binary = resolvePlatformBinary()
  if (binary) {
    if (process.platform !== 'win32') {
      try {
        chmodSync(binary, 0o755)
      } catch {}
    }
    return exit(spawnSync(binary, args, { stdio: 'inherit' }))
  }

  const fallback = resolveBunFallback()
  if (fallback) {
    return exit(spawnSync(fallback.bun, [fallback.main, ...args], { stdio: 'inherit' }))
  }

  console.error(
    `viewmd: no prebuilt binary for ${process.platform}-${process.arch} and no bun runtime found.\n` +
      `Install bun (https://bun.sh) to run from source, or file an issue at https://github.com/denolfe/viewmd/issues.`,
  )
  process.exit(1)
}

if (require.main === module) run()

module.exports = { PLATFORM_PACKAGES, resolvePlatformBinary }
