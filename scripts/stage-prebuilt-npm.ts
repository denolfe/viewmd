#!/usr/bin/env bun
import { cp, mkdir, readdir, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { PLATFORMS } from './platforms'
import { buildPlatformManifest, buildRootManifest } from './stage-lib'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'artifact-root': { type: 'string', default: 'dist/bin' },
    version: { type: 'string' },
  },
})

const artifactRoot = values['artifact-root'] ?? 'dist/bin'
const source = JSON.parse(await readFile('package.json', 'utf8'))
const version = values.version ?? source.version

const outRoot = 'dist/release/npm'
await rm(outRoot, { recursive: true, force: true })
await mkdir(outRoot, { recursive: true })

// Each artifact dir contains metadata.json + the binary (flat layout for
// `--artifact-root dist/bin`; nested `<pkg>/metadata.json` for CI downloads).
const metadataFiles = await findMetadata(artifactRoot)
if (metadataFiles.length === 0) throw new Error(`No metadata.json found under ${artifactRoot}`)

for (const metaPath of metadataFiles) {
  const meta = JSON.parse(await readFile(metaPath, 'utf8'))
  const platform = PLATFORMS.find(p => p.id === meta.platform)
  if (!platform) throw new Error(`Unknown platform in ${metaPath}: ${meta.platform}`)

  const dir = metaPath.replace(/metadata\.json$/, '')
  const srcBin = `${dir}${meta.binName}`
  const pkgDir = `${outRoot}/viewmd-${platform.id}`
  await mkdir(`${pkgDir}/bin`, { recursive: true })
  await cp(srcBin, `${pkgDir}/bin/${platform.binName}`)
  await chmod(`${pkgDir}/bin/${platform.binName}`, 0o755)
  await cp('LICENSE', `${pkgDir}/LICENSE`)
  await writeFile(
    `${pkgDir}/package.json`,
    `${JSON.stringify(buildPlatformManifest({ platform, version }), null, 2)}\n`,
  )
  console.log(`Staged viewmd-${platform.id}`)
}

// Root meta-package.
const rootDir = `${outRoot}/viewmd`
await mkdir(`${rootDir}/bin`, { recursive: true })
await cp('bin/viewmd.cjs', `${rootDir}/bin/viewmd.cjs`)
await cp('dist/npm', `${rootDir}/dist/npm`, { recursive: true })
await cp('assets/parsers', `${rootDir}/assets/parsers`, { recursive: true })
await cp('README.md', `${rootDir}/README.md`)
await cp('LICENSE', `${rootDir}/LICENSE`)
await writeFile(
  `${rootDir}/package.json`,
  `${JSON.stringify(buildRootManifest({ source, version }), null, 2)}\n`,
)
console.log(`Staged root viewmd @ ${version}`)

async function findMetadata(root: string): Promise<string[]> {
  const results: string[] = []
  if (existsSync(`${root}/metadata.json`)) results.push(`${root}/metadata.json`)
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    if (e.isDirectory() && existsSync(`${root}/${e.name}/metadata.json`)) {
      results.push(`${root}/${e.name}/metadata.json`)
    }
  }
  return results
}
