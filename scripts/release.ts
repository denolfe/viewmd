#!/usr/bin/env bun
import { $ } from 'bun'
import semver from 'semver'

// Usage: bun run release [beta|patch|minor|<version>]  e.g. bun run release minor
// `beta` (the default) bumps the beta prerelease off the current version.
// `patch` finalizes the current prerelease (0.1.0-beta.3 -> 0.1.0), or bumps
// the patch if the current version is already stable. `minor` bumps the minor
// (0.1.x -> 0.2.0). An explicit version like 0.2.0 is also accepted. CI derives
// the npm dist-tag from the version itself: prerelease versions publish under
// `beta`, stable versions under `latest`.
// Bumps package.json, then commits, tags, and pushes. A changelog of commits
// since the last tag is generated once and reused as the commit body and the
// annotated tag message.

const PREID = 'beta'

const arg = process.argv[2] ?? 'beta'
if (arg.startsWith('v')) {
  console.error(`Pass the version without a leading "v" (got "${arg}").`)
  process.exit(1)
}

const current = await readVersion()
const version = resolveVersion(current, arg)
const tag = `v${version}`

const status = (await $`git status --porcelain`.text()).trim()
if (status) {
  console.error('Working tree is not clean. Commit or stash changes first.')
  process.exit(1)
}

const existingTag = (await $`git tag --list ${tag}`.text()).trim()
if (existingTag) {
  console.error(`Tag ${tag} already exists.`)
  process.exit(1)
}

const channel = semver.prerelease(version) ? 'beta' : 'latest'
const confirmed = prompt(`Release v${current} -> ${tag} (npm dist-tag: ${channel})? [y/N]`)
if (confirmed?.trim().toLowerCase() !== 'y') {
  console.error('Aborted.')
  process.exit(1)
}

const changelog = await buildChangelog()

await bumpVersion(version)

await $`git commit -am ${`chore(release): ${tag}\n\n${changelog}`}`
await $`git tag -a ${tag} -m ${`${tag}\n\n${changelog}`}`
await $`git push --follow-tags`

console.log(`Released ${tag} (was v${current})`)

function resolveVersion(current: string, arg: string): string {
  if (arg === 'beta') return bump(current, 'prerelease')
  // `patch` finalizes a prerelease (0.1.0-beta.3 -> 0.1.0) or bumps a stable patch.
  if (arg === 'patch' || arg === 'minor') return bump(current, arg)
  if (!semver.valid(arg)) {
    console.error(`Expected "beta", "patch", "minor", or a valid semver version (got "${arg}").`)
    process.exit(1)
  }
  return arg
}

function bump(current: string, release: 'prerelease' | 'patch' | 'minor'): string {
  const next = semver.inc(current, release, PREID)
  if (!next) throw new Error(`Cannot parse current version "${current}".`)
  return next
}

async function readVersion() {
  const pkg = await Bun.file('package.json').json()
  if (typeof pkg.version !== 'string') throw new Error('No "version" field in package.json')
  return pkg.version
}

async function bumpVersion(version: string) {
  const pkgPath = 'package.json'
  const raw = await Bun.file(pkgPath).text()
  const next = raw.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`)
  if (next === raw) throw new Error('Could not find "version" field in package.json')
  await Bun.write(pkgPath, next)
}

async function buildChangelog() {
  const lastTag = (await $`git describe --tags --abbrev=0`.nothrow().text()).trim()
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
  const commits = (
    await $`git log ${range} --no-merges --pretty=format:${'- %s (%h)'}`.text()
  ).trim()
  return commits || '- No changes'
}
