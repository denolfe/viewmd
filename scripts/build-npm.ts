#!/usr/bin/env bun
import { cp, mkdir } from 'node:fs/promises'
import { $ } from 'bun'

const outDir = 'dist/npm'
await mkdir(outDir, { recursive: true })

// Non-compiled bundle for the launcher's bun-runtime fallback path. OpenTUI's
// per-platform native packages (`@opentui/core-*`) are marked external so the
// bundle keeps their dynamic imports and resolves the matching one at runtime
// from the consumer's node_modules. Tree-sitter wasm/scm assets are emitted
// beside main.js, so `--outdir` (not `--outfile`) is required. NODE_ENV is
// pinned so React bundles its production reconciler, not the dev one.
await $`bun build --target=bun --external ${'@opentui/core-*'} --entry-naming ${'[dir]/main.js'} --define ${'process.env.NODE_ENV="production"'} ./src/index.tsx --outdir ${outDir}`

// Ship the tree-sitter worker beside the bundle so OpenTUI resolves it
// relative to import.meta.url in fallback mode.
await cp('node_modules/@opentui/core/parser.worker.js', `${outDir}/parser.worker.js`)

console.log(`Built fallback bundle at ${outDir}/main.js`)
