#!/usr/bin/env bun
import { mkdir, writeFile } from 'node:fs/promises'
import { $ } from 'bun'
import pkg from '../package.json'
import { hostPlatform } from './platforms'

const platform = hostPlatform()
const outDir = 'dist/bin'
const outFile = `${outDir}/${platform.binName}`

await mkdir(outDir, { recursive: true })

await $`bun build --compile --target=${platform.bunTarget} ./src/index.tsx ./node_modules/@opentui/core/parser.worker.js --outfile ${outFile}`

await writeFile(
  `${outDir}/metadata.json`,
  `${JSON.stringify({ platform: platform.id, version: pkg.version, binName: platform.binName }, null, 2)}\n`,
)

console.log(`Built ${outFile} for ${platform.id}`)
