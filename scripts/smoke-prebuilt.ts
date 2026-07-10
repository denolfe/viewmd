#!/usr/bin/env bun
import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { $ } from 'bun'
import { hostPlatform } from './platforms'

const host = hostPlatform()
const staged = 'dist/release/npm'
const rootPkg = `${staged}/viewmd`
const platPkg = `${staged}/viewmd-${host.id}`

if (!existsSync(rootPkg) || !existsSync(platPkg)) {
  throw new Error('Run `bun run stage:prebuilt --artifact-root dist/bin` first')
}

const tmp = 'dist/release/smoke'
await rm(tmp, { recursive: true, force: true })
await mkdir(`${tmp}/node_modules`, { recursive: true })
await cp(rootPkg, `${tmp}/node_modules/viewmd`, { recursive: true })
await cp(platPkg, `${tmp}/node_modules/viewmd-${host.id}`, { recursive: true })

const launcher = `${tmp}/node_modules/viewmd/bin/viewmd.cjs`
const result = await $`node ${launcher} --render README.md`.quiet().nothrow()

if (result.exitCode !== 0 || result.stdout.length === 0) {
  console.error(result.stderr.toString())
  throw new Error(`SMOKE_FAIL exit=${result.exitCode}`)
}
console.log('SMOKE_OK')
