#!/usr/bin/env bun
import { mkdir, writeFile } from 'node:fs/promises'
import pkg from '../package.json'
import { buildShimSource, resolveNativeLib } from './native-shim'
import { hostPlatform } from './platforms'

const platform = hostPlatform()
const outDir = 'dist/bin'
const outFile = `${outDir}/${platform.binName}`

await mkdir(outDir, { recursive: true })

// Replace the OpenTUI native package with a shim that dlopens the lib from a
// stable cache path instead of re-extracting the embedded copy on every run.
const native = resolveNativeLib(platform)
const shimSource = buildShimSource(native)

await Bun.build({
  entrypoints: ['./src/index.tsx', './node_modules/@opentui/core/parser.worker.js'],
  compile: { target: platform.bunTarget, outfile: outFile },
  plugins: [
    {
      name: 'opentui-native-stable-cache',
      setup(build) {
        build.onResolve({ filter: new RegExp(`^${native.packageName}$`) }, () => ({
          path: native.packageName,
          namespace: 'opentui-native-shim',
        }))
        build.onLoad({ filter: /.*/, namespace: 'opentui-native-shim' }, () => ({
          contents: shimSource,
          loader: 'ts',
        }))
      },
    },
  ],
})

await writeFile(
  `${outDir}/metadata.json`,
  `${JSON.stringify({ platform: platform.id, version: pkg.version, binName: platform.binName }, null, 2)}\n`,
)

console.log(`Built ${outFile} for ${platform.id}`)
