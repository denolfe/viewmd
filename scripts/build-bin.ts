#!/usr/bin/env bun
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import pkg from '../package.json'
import {
  buildShimSource,
  buildWorkerRuntimeSource,
  packageVersion,
  resolveNativeLib,
  resolvePackageDir,
} from './native-shim'
import { hostPlatform } from './platforms'
import type { TlaPatch } from './tla-patches'
import { applyTlaPatches, assertPatchesApplied, buildTlaPatches } from './tla-patches'

const platform = hostPlatform()
const outDir = 'dist/bin'
const workerDir = 'dist/worker'
const outFile = `${outDir}/${platform.binName}`

await mkdir(outDir, { recursive: true })

// Stage 1: bundle the tree-sitter worker as plain ESM. It can't be a bytecode
// compile entrypoint (its wasm dynamic import breaks under CJS bytecode), so
// the compiled binary embeds these outputs as file assets instead and
// materializes them to the cache dir at startup (see buildWorkerRuntimeSource).
await rm(workerDir, { recursive: true, force: true })
const workerBuild = await Bun.build({
  entrypoints: ['./node_modules/@opentui/core/parser.worker.js'],
  target: 'bun',
  format: 'esm',
  outdir: workerDir,
})
const workerFiles = workerBuild.outputs.map(o => ({ absPath: o.path, name: basename(o.path) }))
const workerEntry = workerBuild.outputs.find(o => o.kind === 'entry-point')
if (!workerEntry) throw new Error('worker bundle produced no entry point')

// Stage 2: compile the CLI with bytecode. The plugin swaps in two generated
// modules: the OpenTUI platform package becomes the stable-cache dylib shim,
// and compiled-runtime.ts becomes the worker materializer. OpenTUI's
// module-scope awaits are rewritten to sync equivalents (bytecode needs CJS,
// which forbids top-level await).
const native = resolveNativeLib(platform)
const shimSource = buildShimSource(native)
const workerRuntimeSource = buildWorkerRuntimeSource({
  entryName: basename(workerEntry.path),
  files: workerFiles,
  version: packageVersion(resolvePackageDir('@opentui/core')),
})
const patches = buildTlaPatches(native.packageName)
const appliedPatches = new Set<TlaPatch>()

await Bun.build({
  entrypoints: ['./src/index.tsx'],
  compile: { target: platform.bunTarget, outfile: outFile },
  format: 'cjs',
  bytecode: true,
  plugins: [
    {
      name: 'viewmd-compiled-runtime',
      setup(build) {
        // resolveNativePackage() dynamic-imports every platform variant; the
        // runners install same-OS siblings too (e.g. linux glibc + musl), and
        // bundling a sibling drags in its top-level await. Alias the target
        // package to the shim and every sibling to a not-installed stub — dead
        // code at runtime since the resolveNativePackage() call is patched out.
        build.onResolve({ filter: /^@opentui\/core-[a-z0-9]+-[a-z0-9-]+$/ }, args => ({
          path: args.path,
          namespace:
            args.path === native.packageName ? 'opentui-native-shim' : 'opentui-native-stub',
        }))
        build.onLoad({ filter: /.*/, namespace: 'opentui-native-shim' }, () => ({
          contents: shimSource,
          loader: 'ts',
        }))
        build.onLoad({ filter: /.*/, namespace: 'opentui-native-stub' }, args => ({
          contents: `throw Object.assign(new Error(${JSON.stringify(`${args.path} is not bundled in compiled viewmd`)}), { code: 'ERR_MODULE_NOT_FOUND' })`,
          loader: 'ts',
        }))
        build.onLoad({ filter: /src\/compiled-runtime\.ts$/ }, () => ({
          contents: workerRuntimeSource,
          loader: 'ts',
        }))
        build.onLoad(
          { filter: /@opentui[\\/](core[\\/]index|react[\\/]chunk)-[a-z0-9]+\.js$/ },
          async args => ({
            contents: applyTlaPatches({
              path: args.path,
              source: await Bun.file(args.path).text(),
              patches,
              applied: appliedPatches,
            }),
            loader: 'js',
          }),
        )
      },
    },
  ],
})

assertPatchesApplied(patches, appliedPatches)

await writeFile(
  `${outDir}/metadata.json`,
  `${JSON.stringify({ platform: platform.id, version: pkg.version, binName: platform.binName }, null, 2)}\n`,
)

console.log(`Built ${outFile} for ${platform.id}`)
